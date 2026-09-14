import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRegistrationFromExternalPayment } from '@/lib/registration/actions'
import { verifyWebhookSecret } from '@/lib/ghl/webhook-auth'
import { postRegistrationWriteback } from '@/lib/ghl/post-registration-writeback'
import {
  ghlDollarStringToCents,
  resolveOrCreateEventFromGhl,
  resolveOrCreateTicketTypeForGhlEvent,
} from '@/lib/ghl/events-bridge'
import { isOrgEntitled } from '@/lib/entitlements'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'

const LOG = '[ghl-events]'
const SYNC_SOURCE = 'ghl_events'
const SYNC_EVENT_TYPE = 'event_registration'

// Inbound registrations from GoHighLevel's native Events module (R65).
//
// The defining difference from the payment and app transports: Prezva creates NO
// GHL opportunity and moves NO pipeline stage on this lane. GHL owns the event, the
// order and the attendee record; Prezva mirrors the registration and writes the door
// link back. There is deliberately no enqueueGhlSync call in this file.
//
// The other difference is the dedupe key. One GHL Events order can carry several
// attendees, so the order id is NOT unique per registration — attendee_id is. See
// createRegistrationFromExternalPayment's ghlAttendeeId param.

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

async function recordError(
  db: ReturnType<typeof createAdminClient>,
  syncStateId: string | null,
  lastError: string,
): Promise<void> {
  if (!syncStateId) return
  await db
    .from('ghl_sync_state')
    .update({ status: 'failed', last_error: lastError, updated_at: new Date().toISOString() })
    .eq('id', syncStateId)
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  let syncStateId: string | null = null

  try {
    // 1. Body first: the location claim that selects which secret applies lives in
    // it, so it must be read before the credential can be chosen. Untrusted until
    // step 2 authenticates.
    let body: Record<string, unknown>
    try {
      body = JSON.parse(await req.text()) as Record<string, unknown>
    } catch {
      // No parse, no location claim, and this route has no global fallback to
      // verify against (see step 2) — so an unparseable body is indistinguishable
      // from an unauthenticated one and gets the same answer.
      return new NextResponse(null, { status: 401 })
    }

    const location = body.location as Record<string, unknown> | undefined
    const customData = (body.customData ?? {}) as Record<string, unknown>
    const locationId = str(body.location_id) ?? str(location?.id)

    // 2. Authenticate. The location is ALWAYS passed — never omitted.
    //
    // The refund route omits it when the body carries none, which silently drops
    // that request to the shared global secret. This route must not inherit that:
    // GHL's Events trigger sends no signature of its own, so this header is the
    // ONLY authentication here, and a per-location secret is the only thing that
    // makes it tenant-specific. A body with no location id therefore cannot be
    // authenticated at all and is refused rather than downgraded.
    if (!locationId) return new NextResponse(null, { status: 401 })

    const auth = await verifyWebhookSecret(req, { admin: supabase, locationId })
    if (!auth.ok) return new NextResponse(null, { status: 401 })

    // ── Authenticated. From here every failure records last_error and returns 200:
    // GHL retries any non-2xx up to 12 times, so a 4xx/5xx on a permanent failure
    // buys a retry storm against a condition that will never change. ──

    const attendeeId = str(customData.attendee_id)
    const contactId = str(body.contact_id) ?? str(customData.contact_id)
    if (!attendeeId) {
      console.error(`${LOG} attendee_id missing from customData`, { locationId })
      return NextResponse.json({ status: 'attendee_id_missing' })
    }

    // 3. Idempotency on the attendee id — the one identifier that is per-seat.
    const { data: existingState } = await supabase
      .from('ghl_sync_state')
      .select('id, status')
      .eq('source', SYNC_SOURCE)
      .eq('event_type', SYNC_EVENT_TYPE)
      .eq('external_event_id', attendeeId)
      .maybeSingle()

    if (existingState?.status === 'synced' || existingState?.status === 'queued_for_sync') {
      console.log(`${LOG} duplicate — attendee already processed`, { attendeeId })
      return NextResponse.json({ status: 'already_processed' })
    }

    // Declared non-nullable and definitely assigned on both branches. The outer
    // `syncStateId` stays nullable so the catch at the bottom can tell "failed
    // before the ledger row existed" from "failed after"; this one is what the
    // rest of the handler uses.
    let stateId: string
    if (existingState) {
      stateId = existingState.id
    } else {
      const { data: newState, error: insertErr } = await supabase
        .from('ghl_sync_state')
        .insert({
          location_id:       locationId,
          source:            SYNC_SOURCE,
          event_type:        SYNC_EVENT_TYPE,
          external_event_id: attendeeId,
          payload_hash:      '',
          status:            'pending',
          raw_payload:       body as unknown as Json,
          ghl_contact_id:    contactId ?? null,
        })
        .select('id')
        .single()

      if (insertErr || !newState) {
        // Transient: the DB failed and a retry genuinely might succeed, so this is
        // the one case that earns a non-2xx.
        console.error(`${LOG} failed to insert ghl_sync_state:`, insertErr)
        return NextResponse.json({ error: 'internal_error' }, { status: 500 })
      }
      stateId = newState.id
    }
    syncStateId = stateId

    // 4. Location → org.
    const { data: locationLink } = await supabase
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()

    if (!locationLink) {
      console.error(`${LOG} location_not_bound`, { locationId, attendeeId })
      await recordError(supabase, stateId, 'location_not_bound')
      return NextResponse.json({ status: 'location_not_bound' })
    }

    // 5. Entitlement backstop (GE-8), same stance as the payment route: an
    // unentitled org can build and preview, but a real GHL-linked registration
    // never lands for one. Loud and on the ledger, never a silent accept.
    if (!(await isOrgEntitled(locationLink.org_id))) {
      console.error(`${LOG} entitlement_blocked — org ${locationLink.org_id}`, { attendeeId })
      await recordError(supabase, stateId, 'entitlement_blocked')
      return NextResponse.json({ status: 'entitlement_blocked' })
    }

    // 6. Resolve the event. Refuses rather than guesses a timezone.
    const eventResult = await resolveOrCreateEventFromGhl({
      db:         supabase,
      orgId:      locationLink.org_id,
      ghlEventId: str(customData.event_id) ?? '',
      title:      str(customData.event_name) ?? str(customData.event_title),
      startAt:    str(customData.event_start_at) ?? str(customData.event_start_time),
      endAt:      str(customData.event_end_at) ?? str(customData.event_end_time),
      timezone:   str(customData.event_timezone) ?? str(customData.timezone),
    })

    if (!eventResult.ok) {
      console.error(`${LOG} event unresolved:`, eventResult.error, { attendeeId })
      await recordError(supabase, stateId, eventResult.error)
      return NextResponse.json({ status: eventResult.error })
    }

    // 7. Ticket type. A label, never a gate — an unusable name yields the fallback
    // type rather than refusing a seat GHL has already been paid for.
    const ticketTypeId = await resolveOrCreateTicketTypeForGhlEvent({
      db:      supabase,
      eventId: eventResult.eventId,
      name:    str(customData.ticket_name) ?? str(customData.ticket_type),
    })

    if (!ticketTypeId) {
      // Not a naming problem — the database would not yield a row at all, and
      // registrations.ticket_type_id is NOT NULL.
      await recordError(supabase, stateId, 'ticket_type_unresolvable')
      return NextResponse.json({ status: 'ticket_type_unresolvable' })
    }

    const attendeeEmail = str(customData.attendee_email) ?? str(body.email)
    const attendeeName =
      str(customData.attendee_name) ?? str(body.full_name) ?? attendeeEmail
    if (!attendeeEmail || !attendeeName) {
      console.error(`${LOG} attendee email/name missing`, { attendeeId })
      await recordError(supabase, stateId, 'attendee_identity_missing')
      return NextResponse.json({ status: 'attendee_identity_missing' })
    }

    let amountPaidCents: number
    try {
      amountPaidCents = ghlDollarStringToCents(
        (customData.order_total ?? body.order_total) as string | number | null | undefined,
      )
    } catch (e) {
      // Unparseable money is not zero. Recording it beats booking a paid seat free.
      console.error(`${LOG} order_total unparseable:`, e, { attendeeId })
      await recordError(supabase, stateId, 'order_total_unparseable')
      return NextResponse.json({ status: 'order_total_unparseable' })
    }

    const ghlOrderId = str(customData.order_id) ?? str(body.order_id)

    // 8. Create the registration, deduped on the ATTENDEE id.
    const result = await createRegistrationFromExternalPayment({
      eventId:         eventResult.eventId,
      ticketTypeId,
      attendeeEmail,
      attendeeName,
      attendeePhone:   str(customData.attendee_phone) ?? str(body.phone) ?? null,
      amountPaidCents,
      currency:        str(customData.currency) ?? 'USD',
      externalSource:  SYNC_SOURCE,
      // Unused on this lane: external_order_id is written null because one order is
      // shared by every seat on it. The order is recorded on ghl_order_id below.
      externalOrderId: ghlOrderId ?? attendeeId,
      paymentGateway:  str(customData.payment_gateway) ?? 'ghl_events',
      ghlAttendeeId:   attendeeId,
      ghlOrderId,
    })

    if (!result.success) {
      // Two seats on one order sharing an email address. A real refusal that has to
      // stay visible on the ledger — not swallowed, and not retried, because the
      // condition will never change on redelivery.
      if (result.error === 'duplicate_attendee_email_on_event') {
        console.error(`${LOG} duplicate_attendee_email_on_event`, { attendeeId, ghlOrderId })
        await recordError(supabase, stateId, 'duplicate_attendee_email_on_event')
        return NextResponse.json({ status: 'duplicate_attendee_email_on_event' })
      }
      if (result.waitlisted) {
        await supabase
          .from('ghl_sync_state')
          .update({ status: 'waitlisted', updated_at: new Date().toISOString() })
          .eq('id', stateId)
        return NextResponse.json({ status: 'waitlisted' })
      }
      console.error(`${LOG} registration failed:`, result.error, { attendeeId })
      await recordError(supabase, stateId, result.error)
      return NextResponse.json({ status: 'registration_failed' })
    }

    // 9. Terminal. 'synced', not 'queued_for_sync': there is no background job on
    // this lane to promote it later, because R65 rules that Prezva creates no GHL
    // opportunity here. Everything this registration owes GHL is the contact
    // writeback below, and that happens before the 200.
    await supabase
      .from('ghl_sync_state')
      .update({
        internal_registration_id: result.registrationId,
        status:                   'synced',
        updated_at:               new Date().toISOString(),
        ghl_contact_id:           contactId ?? null,
      })
      .eq('id', stateId)

    const { data: ev } = await supabase
      .from('events')
      .select('title, slug, start_at, end_at, timezone')
      .eq('id', eventResult.eventId)
      .maybeSingle()

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const eventSlug = ev?.slug ?? eventResult.slug
    const entryUrl = appUrl && eventSlug
      ? (result.appAccessToken
          ? `${appUrl}/e/${eventSlug}/app-access?t=${result.appAccessToken}`
          : `${appUrl}/e/${eventSlug}/enter?reg=${result.registrationId}`)
      : null

    // Same shared writeback both other transports use (R55 Batch 2 / R56): writes
    // the door link onto the contact, then fires prezva-link-ready. Synchronous so
    // the field is set before the GHL workflow's next step runs. Non-fatal
    // throughout — a GHL hiccup must never fail an accepted registration.
    if (entryUrl && contactId) {
      await postRegistrationWriteback({
        supabase,
        orgId:         locationLink.org_id,
        syncStateId: stateId,
        locationId,
        contactId,
        entryUrl,
        eventTitle:    ev?.title ?? null,
        eventStartAt:  ev?.start_at ?? null,
        eventEndAt:    ev?.end_at ?? null,
        eventTimezone: ev?.timezone ?? null,
        logTag:        LOG,
      })
    }

    return NextResponse.json({
      status: 'accepted',
      registrationId: result.registrationId,
      entryUrl,
    })
  } catch (err) {
    console.error(`${LOG} Unexpected error:`, err)
    await recordError(supabase, syncStateId, `unexpected_error: ${(err as Error)?.message ?? 'unknown'}`)
    // Still 200 — see the retry-storm note above.
    return NextResponse.json({ status: 'internal_error' })
  }
}
