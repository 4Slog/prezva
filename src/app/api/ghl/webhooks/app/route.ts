import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRegistrationFromExternalPayment } from '@/lib/registration/actions'
import { enqueueGhlSync } from '@/lib/trigger'
import { parsePaymentWebhookInput } from '@/lib/ghl/sanitize-payment-input'
import { verifyGhlAppSignature, GHL_APP_WEBHOOK_SIGNATURE_HEADER } from '@/lib/ghl/app-webhook-auth'
import { postRegistrationWriteback } from '@/lib/ghl/post-registration-writeback'
import { isOrgEntitled } from '@/lib/entitlements'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'

const LOG = '[ghl-app-webhook]'

// GHL Marketplace app webhooks for the payment half (R55 Batch 2, O53).
// Ed25519-signed by GHL — no shared secret to provision or leak, which is why
// this transport supersedes the workflow webhook for payments. Refunds
// structurally cannot migrate (GHL sends no refund app-webhook event) and stay
// on the per-location secret wire.
//
// RESPONSE SEMANTICS ARE LEAD-BEARING HERE. GHL retries ANY non-2xx — 4xx
// included — up to 12 times with jitter. So the usual instinct ("bad input is a
// 400") is actively wrong on this endpoint: a 400 for an unmapped ticket would
// retry twelve times against a condition no retry can fix. The rule is retry
// only what a retry could plausibly resolve:
//   processed / duplicate / permanent -> 200 with a distinct status string
//   transient (DB down, GHL 5xx, unexpected throw) -> 500, the ONLY non-2xx
//   bad signature -> 401 and no ledger row (an unauthenticated caller must
//     never be able to write rows to ghl_sync_state)
// Permanent failures are still loud: console.error plus a ghl_sync_state row
// marked failed. Loudness comes from the ledger, not the status code.

// The transition triple. IDENTICAL to what the workflow route
// (/api/ghl/webhooks/payment) writes — source 'ghl_payment', event_type
// 'order_submitted', external_event_id = the order id — because both transports
// fire for the same order until the workflow's webhook action is removed.
// Sharing the triple is what makes whichever arrives second read
// already-processed instead of creating a second registration, a second
// enqueue, and a second calendar appointment. Do not "clean this up" to a
// transport-specific event_type: that silently disables cross-transport dedup.
const SYNC_SOURCE = 'ghl_payment'
const SYNC_EVENT_TYPE = 'order_submitted'

interface GhlAppOrderItem {
  qty?: unknown
  price?: { _id?: unknown }
  product?: { _id?: unknown }
}

// The real app-webhook contactSnapshot carries firstName + lastName and has NO
// name or full_name key — the workflow payload's `full_name` does not exist on
// this transport. Reading only those keys produced an empty name, which the
// sanitizer correctly rejects as invalid_name, so every live order 200'd as
// bad_shape and silently created nothing (proven on order 6a87abee7ec1ad578d6029c4).
//
// Parts first, then the singular-key fallbacks, because the parts are what GHL
// actually sends. Handles one part present (a contact with no surname is
// ordinary), and returns undefined when nothing usable is there — deliberately
// letting the sanitizer reject rather than inventing a placeholder name that
// would land on a real badge and a real certificate.
function attendeeNameFrom(snapshot: Record<string, unknown>): string | undefined {
  const first = typeof snapshot.firstName === 'string' ? snapshot.firstName.trim() : ''
  const last = typeof snapshot.lastName === 'string' ? snapshot.lastName.trim() : ''
  const joined = [first, last].filter(Boolean).join(' ')
  if (joined) return joined

  return (snapshot.name ?? snapshot.full_name) as string | undefined
}

export async function POST(req: NextRequest) {
  try {
    // 1. Raw body, read exactly once. Ed25519 signs the bytes on the wire, so
    // this string — not a re-serialized parse of it — is what gets verified.
    const rawBody = await req.text()

    // 2. Signature. Before any parse, any DB touch, any ledger row.
    if (!verifyGhlAppSignature(rawBody, req.headers.get(GHL_APP_WEBHOOK_SIGNATURE_HEADER))) {
      console.error(`${LOG} signature verification failed — rejecting`)
      return new NextResponse(null, { status: 401 })
    }

    // Constructed only after the signature passes, and inside the try so a
    // failure to construct becomes a 500 (transient, retryable) rather than an
    // exception escaping the handler.
    const supabase = createAdminClient()

    // 3. Parse. A signed-but-unparseable body is permanent: GHL signed it, so
    // redelivering the same bytes will fail identically twelve more times.
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      console.error(`${LOG} bad_shape — signed payload is not valid JSON`)
      return NextResponse.json({ status: 'bad_shape' })
    }

    // 4. Event policy. GHL sends OrderCreate (pending) AND OrderStatusUpdate
    // for the same order. Only a completed OrderStatusUpdate represents money
    // actually taken, so it is the only event that creates a registration.
    // Both ignores are 200 with no ledger row — they are normal traffic, not
    // failures, and writing a row for them would make the sync-health pill lie.
    const eventType = typeof body.type === 'string' ? body.type : null
    const orderStatus = typeof body.status === 'string' ? body.status : null

    if (eventType === 'OrderCreate') {
      console.log(`${LOG} OrderCreate ignored (pending, not yet paid)`, { orderId: body._id ?? null })
      return NextResponse.json({ status: 'ignored_pending' })
    }

    if (eventType === 'OrderStatusUpdate' && orderStatus !== 'completed') {
      console.log(`${LOG} OrderStatusUpdate ignored — status is not completed`, {
        orderId: body._id ?? null, status: orderStatus,
      })
      return NextResponse.json({ status: 'ignored_not_completed' })
    }

    if (eventType !== 'OrderStatusUpdate') {
      console.log(`${LOG} ignored — unhandled event type`, { type: eventType })
      return NextResponse.json({ status: 'ignored_unhandled_type' })
    }

    // 4b. Events orders stand down here (R76). GHL's native Events module posts its
    // orders to this app webhook too, but the payload cannot carry a registration:
    // it has no attendee_id for a guest seat, no per-seat email, and none of the
    // event's start/end/timezone — proven 2026-09-22 against order
    // 6ab27f2c4abfc6e2004c1e3f, whose two seats arrive as source.meta.guests[] with
    // nothing but ticket/contact ids. Events registrations therefore arrive
    // per-attendee on /api/ghl/webhooks/event-registration, which is the only
    // transport that sees a seat.
    //
    // Placed BEFORE the ledger: writing a ghl_sync_state row for an order this
    // route will never register would leave a permanent `failed` row shadowing the
    // real per-seat rows the Events route writes, and would make the sync-health
    // pill report a failure that is actually correct behaviour. Store orders are
    // untouched — only source.type === 'events_management' diverts.
    //
    // source is an OBJECT on the app transport (jsonb_typeof-verified), but it is
    // read defensively as a possible JSON string so a serialization change on GHL's
    // side cannot silently resume creating Events registrations here.
    let orderSource: Record<string, unknown> | null = null
    if (typeof body.source === 'string') {
      try {
        const parsedSource: unknown = JSON.parse(body.source)
        if (parsedSource && typeof parsedSource === 'object') {
          orderSource = parsedSource as Record<string, unknown>
        }
      } catch {
        // Not JSON, so it carries no type claim — treated as no source at all and
        // the order falls through to the normal Store path.
      }
    } else if (body.source && typeof body.source === 'object') {
      orderSource = body.source as Record<string, unknown>
    }

    if (orderSource?.type === 'events_management') {
      console.log(
        `${LOG} Events order ignored — Events registrations arrive on /webhooks/event-registration (R76)`,
        { orderId: body._id ?? null, sourceId: orderSource.id ?? null },
      )
      return NextResponse.json({ status: 'ignored_events_order' })
    }

    // 5. Flat payload extraction (G27 shape). Unlike the workflow payload there
    // is no order.line_items[0].meta nesting — the ids sit at the top level and
    // on items[].price/product. Everything below this point consumes flat
    // scalars identical to the workflow route's, which is what lets both
    // transports share parsePaymentWebhookInput and the whole resolution chain.
    const items = Array.isArray(body.items) ? (body.items as GhlAppOrderItem[]) : []
    const firstItem = items[0]

    const currency = typeof body.currency === 'string' ? body.currency : 'USD'
    const paymentGateway = typeof body.paymentGateway === 'string' ? body.paymentGateway : 'unknown'

    // AMOUNT UNIT CONFIRMED DOLLARS by the live cross-transport order
    // (6a87abee7ec1ad578d6029c4 sent amount: 225 for a $225 order), so the x100
    // conversion matches the workflow transport and is now evidence-backed
    // rather than presumed. The side-by-side log below is retained as a standing
    // canary: if GHL ever switches to minor units the parser would accept it
    // silently (it only checks finite and >= 0), and that line is the only place
    // the change would be visible.
    const rawAmount = body.amount
    const amountPaidCents = Math.round(Number(rawAmount) * 100)

    const contactSnapshot = (body.contactSnapshot ?? {}) as Record<string, unknown>

    const parsed = parsePaymentWebhookInput({
      ghlOrderId:      typeof body._id === 'string' ? body._id : undefined,
      locationId:      typeof body.locationId === 'string' ? body.locationId : undefined,
      contactId:       typeof body.contactId === 'string' ? body.contactId : undefined,
      attendeeEmail:   contactSnapshot.email as string | undefined,
      attendeeName:    attendeeNameFrom(contactSnapshot),
      attendeePhone:   contactSnapshot.phone as string | undefined,
      productId:       firstItem?.product?._id as string | undefined,
      priceId:         firstItem?.price?._id as string | undefined,
      amountPaidCents,
      seatQty:         firstItem?.qty,
    })

    // A signed payload we cannot make sense of is permanent, not transient —
    // 200 so GHL stops, console.error so we see it. No ledger row: without a
    // usable order id there is no external_event_id to key one on.
    if (!parsed.ok) {
      console.error(`${LOG} bad_shape — payload failed sanitization`, { orderId: body._id ?? null })
      return NextResponse.json({ status: 'bad_shape' })
    }

    const {
      ghlOrderId, locationId, contactId, attendeeEmail, attendeeName, attendeePhone,
      productId, priceId, seatQty,
    } = parsed.data

    if (!ghlOrderId || !locationId || !contactId || !productId || !priceId) {
      console.error(`${LOG} bad_shape — missing required ids`, {
        hasOrderId: !!ghlOrderId, hasLocationId: !!locationId, hasContactId: !!contactId,
        hasProductId: !!productId, hasPriceId: !!priceId,
      })
      return NextResponse.json({ status: 'bad_shape' })
    }

    // Observational only (R30 not yet retired). Logged so the rehearsal can tell
    // a genuine multi-seat order from a coupon-discounted single seat, which the
    // amount-divergence tripwire alone cannot distinguish.
    console.log(`${LOG} order received`, { ghlOrderId, locationId, seatQty: seatQty ?? null })

    // 6. Cross-transport idempotency on the shared triple.
    const { data: existingState } = await supabase
      .from('ghl_sync_state')
      .select('id, status, dead_lettered, retries')
      .eq('source', SYNC_SOURCE)
      .eq('event_type', SYNC_EVENT_TYPE)
      .eq('external_event_id', ghlOrderId)
      .maybeSingle()

    if (existingState?.status === 'synced' || existingState?.status === 'queued_for_sync') {
      console.log(`${LOG} duplicate — order already processed on this or the workflow transport`, { ghlOrderId })
      return NextResponse.json({ status: 'duplicate' })
    }

    let syncStateId: string
    if (existingState) {
      syncStateId = existingState.id
    } else {
      const { data: newState, error: insertErr } = await supabase
        .from('ghl_sync_state')
        .insert({
          location_id:       locationId,
          source:            SYNC_SOURCE,
          event_type:        SYNC_EVENT_TYPE,
          external_event_id: ghlOrderId,
          payload_hash:      '',
          status:            'pending',
          raw_payload:       body as unknown as Json,
          ghl_contact_id:    contactId,
        })
        .select('id')
        .single()

      if (insertErr || !newState) {
        // Transient: the DB failed, and a retry genuinely might succeed.
        console.error(`${LOG} failed to insert ghl_sync_state:`, insertErr)
        return NextResponse.json({ error: 'internal_error' }, { status: 500 })
      }
      syncStateId = newState.id
    }

    // 7. Org lookup.
    const { data: locationLink } = await supabase
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()

    if (!locationLink) {
      console.error(`${LOG} location_not_bound`, { locationId, ghlOrderId })
      await markFailed(supabase, syncStateId, 'location_not_bound')
      return NextResponse.json({ status: 'location_not_bound' })
    }

    // 8. Ticket mapping, filtered by location so a forged locationId can never
    // resolve another tenant's mapping (security review, Vuln 3 on 6e465e9).
    const { data: mapping, error: mappingErr } = await supabase
      .from('ticket_type_product_mappings')
      .select('ticket_type_id, event_id, price_cents, org_id')
      .eq('ghl_product_id', productId)
      .eq('ghl_price_id', priceId)
      .eq('ghl_location_id', locationId)
      .maybeSingle()

    if (!mapping?.ticket_type_id || !mapping?.event_id) {
      // Zero rows and 2+ rows are different failures: maybeSingle() errors
      // rather than picking one when the same price maps to multiple events,
      // which is a more urgent problem than "not mapped at all".
      const lastError = mappingErr ? 'ticket_mapping_ambiguous' : 'ticket_not_mapped'
      if (mappingErr) {
        console.error(`${LOG} ambiguous ticket mapping for product=${productId} price=${priceId} location=${locationId}:`, mappingErr)
      } else {
        console.warn(`${LOG} no ticket mapping for product=${productId} price=${priceId}`)
      }
      await markFailed(supabase, syncStateId, lastError)
      return NextResponse.json({ status: lastError })
    }

    const ticketTypeId = mapping.ticket_type_id
    const eventId = mapping.event_id
    const mappedPriceCents = mapping.price_cents

    const [{ data: ttRow }, { data: evRow }] = await Promise.all([
      supabase.from('ticket_types').select('name').eq('id', ticketTypeId).maybeSingle(),
      supabase.from('events').select('title, slug, start_at, end_at, timezone').eq('id', eventId).maybeSingle(),
    ])
    const ticketTypeTitle = ttRow?.name ?? null
    const eventTitle = evRow?.title ?? null
    const eventSlug = evRow?.slug ?? null
    const eventStartAt = evRow?.start_at ?? null
    const eventEndAt = evRow?.end_at ?? null
    const eventTimezone = evRow?.timezone ?? null

    // THE UNIT EVIDENCE LINE. Raw amount and the mapping's known-cents price
    // side by side: if the presumed-dollars reading is right these differ by
    // exactly 100x, and if GHL sends minor units they will match. Info level so
    // it survives in production logs for the rehearsal read.
    console.log(`${LOG} amount unit check (dollars confirmed — canary against a future unit change)`, {
      ghlOrderId,
      rawAmount,
      convertedCents: amountPaidCents,
      mappingPriceCents: mappedPriceCents,
      seatQty: seatQty ?? null,
    })

    // 9. Tenant cross-check — defense in depth against a mapping's org_id
    // drifting from ghl_location_links (e.g. a stale mapping surviving a rebind).
    if (mapping.org_id !== locationLink.org_id) {
      console.error(
        `${LOG} tenant_mismatch — mapping.org_id=${mapping.org_id} locationLink.org_id=${locationLink.org_id} (product=${productId} price=${priceId} location=${locationId})`,
      )
      await markFailed(supabase, syncStateId, 'tenant_mismatch')
      return NextResponse.json({ status: 'tenant_mismatch' })
    }

    // 10. Entitlement backstop. An unentitled org can build and preview drafts,
    // but a real GHL-linked registration never lands for one.
    if (!(await isOrgEntitled(locationLink.org_id))) {
      console.error(`${LOG} entitlement_blocked — org ${locationLink.org_id} is not entitled (product=${productId} price=${priceId})`)
      await markFailed(supabase, syncStateId, 'entitlement_blocked')
      return NextResponse.json({ status: 'entitlement_blocked' })
    }

    // 11. Multi-seat tripwire (R30): > not != — coupons and discounts mean
    // paid < expected legitimately, so only overpayment suggests extra seats.
    // Canary only, never blocks.
    if (mappedPriceCents === null) {
      console.error(`${LOG} amount unverifiable — mapping has no price_cents:`, { ghlOrderId, paidCents: amountPaidCents })
      await noteError(supabase, syncStateId, `amount_unverifiable: paid=${amountPaidCents} expected=null`)
    } else if (amountPaidCents > mappedPriceCents) {
      console.error(`${LOG} amount divergence — possible multi-seat order:`, {
        ghlOrderId, expectedCents: mappedPriceCents, paidCents: amountPaidCents, seatQty: seatQty ?? null,
      })
      await noteError(supabase, syncStateId, `amount_divergence: paid=${amountPaidCents} expected=${mappedPriceCents}`)
    }

    // 12. Registration. external_order_id is the shared idempotency key across
    // both transports, so a registration created by the workflow route is
    // returned here rather than duplicated.
    const result = await createRegistrationFromExternalPayment({
      eventId,
      ticketTypeId,
      attendeeEmail,
      attendeeName,
      attendeePhone: attendeePhone ?? null,
      amountPaidCents,
      currency,
      externalSource:  SYNC_SOURCE,
      externalOrderId: ghlOrderId,
      paymentGateway,
    })

    if (!result.success) {
      if (result.waitlisted) {
        await supabase
          .from('ghl_sync_state')
          .update({ status: 'waitlisted', updated_at: new Date().toISOString() })
          .eq('id', syncStateId)
        return NextResponse.json({ status: 'waitlisted' })
      }
      // Transient: an insert failure that is not capacity and not a duplicate
      // is a real DB problem, so this is one of the few genuine 500s.
      await markFailed(supabase, syncStateId, result.error)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // 13. Queue the outbound sync.
    await supabase
      .from('ghl_sync_state')
      .update({
        internal_registration_id: result.registrationId,
        status:                   'queued_for_sync',
        updated_at:               new Date().toISOString(),
        ghl_contact_id:           contactId,
      })
      .eq('id', syncStateId)

    // Second arg is the attempt generation: the retries count this request read
    // off the row. Two transports racing share it (so their enqueues collapse);
    // a re-drive after a failed run reads a higher one and is let through.
    await enqueueGhlSync({
      registrationId:  result.registrationId,
      ghlLocationId:   locationId,
      ghlContactId:    contactId,
      ghlOrderId,
      ticketTypeTitle: ticketTypeTitle ?? '',
      eventId,
      eventTitle:      eventTitle ?? '',
      eventSlug:       eventSlug ?? '',
      attendeeName,
      amountPaidCents,
      paymentStatus:   'paid',
      syncStateId,
    }, existingState?.retries ?? 0)

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const entryUrl = appUrl && eventSlug
      ? (result.appAccessToken
          ? `${appUrl}/e/${eventSlug}/app-access?t=${result.appAccessToken}`
          : `${appUrl}/e/${eventSlug}/enter?reg=${result.registrationId}`)
      : null

    // 14. Shared writeback — same implementation the workflow route uses,
    // including the appointment idempotency guard that keeps a redelivery from
    // booking a second calendar appointment and re-notifying the attendee.
    if (entryUrl && contactId) {
      await postRegistrationWriteback({
        supabase,
        orgId: locationLink.org_id,
        syncStateId,
        locationId,
        contactId,
        entryUrl,
        eventTitle,
        eventStartAt,
        eventEndAt,
        eventTimezone,
        logTag: LOG,
      })
    }

    return NextResponse.json({ status: 'accepted', registrationId: result.registrationId, entryUrl })
  } catch (err) {
    // Unexpected throw: genuinely unknown, so genuinely retryable.
    console.error(`${LOG} unexpected error:`, err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  syncStateId: string,
  lastError: string,
): Promise<void> {
  await supabase
    .from('ghl_sync_state')
    .update({ status: 'failed', last_error: lastError, updated_at: new Date().toISOString() })
    .eq('id', syncStateId)
}

// Records a note on the ledger WITHOUT changing status — the amount tripwires
// are observations about an otherwise-succeeding registration, not failures.
async function noteError(
  supabase: ReturnType<typeof createAdminClient>,
  syncStateId: string,
  lastError: string,
): Promise<void> {
  await supabase
    .from('ghl_sync_state')
    .update({ last_error: lastError, updated_at: new Date().toISOString() })
    .eq('id', syncStateId)
}
