import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createRegistrationFromExternalPayment,
} from '@/lib/registration/actions'
import { enqueueGhlSync } from '@/lib/trigger'
import { parsePaymentWebhookInput } from '@/lib/ghl/sanitize-payment-input'
import { verifyWebhookSecret } from '@/lib/ghl/webhook-auth'
import { ghlPut } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import { isOrgEntitled } from '@/lib/entitlements'
import type { Json } from '@/types/database'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // 1. Verify shared secret (header X-Prezva-Webhook-Secret or ?secret= query)
    if (!verifyWebhookSecret(req)) {
      return new NextResponse(null, { status: 401 })
    }

    // 2. Parse body
    let rawBody: string
    let body: Record<string, unknown>
    try {
      rawBody = await req.text()
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    const order = body.order as Record<string, unknown> | undefined
    const lineItems = Array.isArray(order?.line_items) ? order!.line_items as Record<string, unknown>[] : []
    const firstItem = lineItems[0] as Record<string, unknown> | undefined
    const meta = firstItem?.meta as Record<string, unknown> | undefined
    const location = body.location as Record<string, unknown> | undefined

    const currency       = (order?.currency_code as string | undefined) ?? 'USD'
    const paymentGateway = (order?.payment_gateway as string | undefined) ?? 'unknown'

    const totalPriceRaw = order?.total_price
    const amountPaidCents = Math.round(Number(totalPriceRaw) * 100)

    const parsed = parsePaymentWebhookInput({
      ghlOrderId:     meta?.order_id as string | undefined,
      locationId:     location?.id as string | undefined,
      contactId:      body.contact_id as string | undefined,
      attendeeEmail:  body.email as string | undefined,
      attendeeName:   body.full_name as string | undefined,
      attendeePhone:  body.phone as string | undefined,
      productId:      meta?.product_id as string | undefined,
      priceId:        meta?.price_id as string | undefined,
      amountPaidCents: amountPaidCents,
    })
    if (!parsed.ok) return parsed.response

    const { ghlOrderId, locationId, contactId, attendeeEmail, attendeeName, attendeePhone, productId, priceId } = parsed.data

    if (!ghlOrderId || !locationId || !contactId || !productId || !priceId) {
      return NextResponse.json({ error: 'missing_required_fields' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 3. Idempotency check via ghl_sync_state
    const { data: existingState } = await supabase
      .from('ghl_sync_state')
      .select('id, status, dead_lettered')
      .eq('source', 'ghl_payment')
      .eq('event_type', 'order_submitted')
      .eq('external_event_id', ghlOrderId)
      .maybeSingle()

    if (existingState?.status === 'synced') {
      return NextResponse.json({ status: 'already_processed' })
    }

    // Upsert sync state row as pending (insert if new, leave existing if pending/failed)
    let syncStateId: string
    if (existingState) {
      syncStateId = existingState.id
    } else {
      const { data: newState, error: insertErr } = await supabase
        .from('ghl_sync_state')
        .insert({
          location_id:       locationId,
          source:            'ghl_payment',
          event_type:        'order_submitted',
          external_event_id: ghlOrderId,
          payload_hash:      '',
          status:            'pending',
          raw_payload:       body as unknown as Json,
          ghl_contact_id:    contactId,
        })
        .select('id')
        .single()

      if (insertErr || !newState) {
        console.error('[ghl-webhook] Failed to insert ghl_sync_state:', insertErr)
        return NextResponse.json({ error: 'internal_error' }, { status: 500 })
      }
      syncStateId = newState.id
    }

    // 4. Org lookup via ghl_location_links
    const { data: locationLink } = await supabase
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', locationId)
      .maybeSingle()

    if (!locationLink) {
      await supabase
        .from('ghl_sync_state')
        .update({ status: 'failed', last_error: 'location_not_bound', updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return NextResponse.json({ error: 'location_not_bound' }, { status: 400 })
    }

    // 5. Ticket type mapping lookup
    let ticketTypeId: string | null = null
    let eventId: string | null = null
    let ticketTypeTitle: string | null = null
    let eventTitle: string | null = null
    let eventSlug: string | null = null
    let mappedPriceCents: number | null = null

    // Filtered by ghl_location_id (not just product/price) so a forged
    // location.id + a real product/price pair from a DIFFERENT location can
    // never resolve someone else's mapping (security review, Vuln 3 on
    // 6e465e9).
    let mappingOrgId: string | null = null
    const { data: mapping } = await supabase
      .from('ticket_type_product_mappings')
      .select('ticket_type_id, event_id, price_cents, org_id')
      .eq('ghl_product_id', productId)
      .eq('ghl_price_id', priceId)
      .eq('ghl_location_id', locationId)
      .maybeSingle()

    if (mapping) {
      ticketTypeId = mapping.ticket_type_id
      eventId      = mapping.event_id
      mappedPriceCents = mapping.price_cents
      mappingOrgId = mapping.org_id

      // Fetch ticket title + event title for the sync task
      const [{ data: ttRow }, { data: evRow }] = await Promise.all([
        supabase.from('ticket_types').select('name').eq('id', ticketTypeId!).maybeSingle(),
        supabase.from('events').select('title, slug').eq('id', eventId!).maybeSingle(),
      ])
      ticketTypeTitle = ttRow?.name ?? null
      eventTitle      = evRow?.title ?? null
      eventSlug       = evRow?.slug ?? null
    }

    if (!ticketTypeId || !eventId) {
      console.warn(`[ghl-webhook] No ticket mapping for product=${productId} price=${priceId}`)
      await supabase
        .from('ghl_sync_state')
        .update({ status: 'failed', last_error: 'ticket_not_mapped', updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return NextResponse.json({ error: 'ticket_not_mapped' }, { status: 400 })
    }

    // 5a-i. Tenant consistency assertion. The location filter above already
    // stops a forged location.id from resolving a different location's
    // mapping — this is defense-in-depth against the mapping's own org_id
    // having drifted from ghl_location_links.org_id (e.g. a stale mapping
    // surviving a location rebind). Never trust the resolved org for
    // entitlement/registration unless both independently agree.
    if (mappingOrgId !== locationLink.org_id) {
      console.error(
        `[ghl-webhook] tenant_mismatch — mapping.org_id=${mappingOrgId} locationLink.org_id=${locationLink.org_id} (product=${productId} price=${priceId} location=${locationId})`,
      )
      await supabase
        .from('ghl_sync_state')
        .update({ status: 'failed', last_error: 'tenant_mismatch', updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return NextResponse.json({ status: 'tenant_mismatch' })
    }

    // 5a-ii. Entitlement backstop (GE-8 R36-R41): an unentitled org can build and
    // preview drafts, but a real GHL-linked registration never lands for one.
    // Loud and recorded on the ledger — never a silent 200 that looks like
    // "accepted" — so an unentitled org's Order Submitted workflow surfaces
    // this instead of quietly losing attendees.
    const orgEntitled = await isOrgEntitled(locationLink.org_id)
    if (!orgEntitled) {
      console.error(
        `[ghl-webhook] entitlement_blocked — org ${locationLink.org_id} is not entitled (product=${productId} price=${priceId})`,
      )
      await supabase
        .from('ghl_sync_state')
        .update({ status: 'failed', last_error: 'entitlement_blocked', updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return NextResponse.json({ status: 'entitlement_blocked' })
    }

    // 5b. Multi-seat tripwire (R30): amount paid vs single-ticket price.
    // > not != — coupons/discounts (paid < expected) are real (e.g. registration
    // 61d9ba3f) and must not trip this. Only overpayment indicates more than one
    // seat in a single registration. Never blocks the webhook — canary only.
    if (mappedPriceCents === null) {
      console.error('[ghl-webhook] amount unverifiable — mapping has no price_cents:', {
        ghlOrderId, paidCents: amountPaidCents,
      })
      await supabase
        .from('ghl_sync_state')
        .update({
          last_error: `amount_unverifiable: paid=${amountPaidCents} expected=null`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', syncStateId)
    } else if (amountPaidCents > mappedPriceCents) {
      console.error('[ghl-webhook] amount divergence — possible multi-seat order:', {
        ghlOrderId, expectedCents: mappedPriceCents, paidCents: amountPaidCents,
      })
      await supabase
        .from('ghl_sync_state')
        .update({
          last_error: `amount_divergence: paid=${amountPaidCents} expected=${mappedPriceCents}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', syncStateId)
    }

    // 6. Create registration
    const result = await createRegistrationFromExternalPayment({
      eventId,
      ticketTypeId,
      attendeeEmail,
      attendeeName,
      attendeePhone: attendeePhone ?? null,
      amountPaidCents,
      currency,
      externalSource:  'ghl_payment',
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
      await supabase
        .from('ghl_sync_state')
        .update({ status: 'failed', last_error: result.error, updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // 7. Mark as queued and enqueue outbound GHL writeback
    await supabase
      .from('ghl_sync_state')
      .update({
        internal_registration_id: result.registrationId,
        status:                   'queued_for_sync',
        updated_at:               new Date().toISOString(),
        ghl_contact_id:           contactId,
      })
      .eq('id', syncStateId)

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
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const entryUrl = appUrl && eventSlug
      ? (result.appAccessToken
          ? `${appUrl}/e/${eventSlug}/app-access?t=${result.appAccessToken}`
          : `${appUrl}/e/${eventSlug}/enter?reg=${result.registrationId}`)
      : null

    // Best-effort: write entryUrl into the GHL contact so the GHL "Send Email"
    // workflow step can link to it via {{contact.prezva_attendee_link}}. Synchronous
    // (before the 200) so the field is deterministically set before the workflow
    // proceeds. Non-fatal: a GHL hiccup must never fail an otherwise-accepted
    // registration.
    if (entryUrl && contactId) {
      try {
        // locationLink was already validated truthy at step 4 — GHL-linkage
        // is implied, so a null config here is always the "linked but
        // unprovisioned" case, not "not linked."
        const config = await getGhlOrgConfig(supabase, locationLink.org_id)
        if (!config) {
          console.error(`[ghl] org ${locationLink.org_id} is GHL-linked but has no ghl_org_config row — sync skipped`)
        } else {
          const token = await ghlAdapter.getAccessToken(locationLink.org_id)
          if (!token) {
            console.error(`[ghl-payment] no GHL access token for org ${locationLink.org_id} — entryUrl not written to contact`, contactId)
            await supabase
              .from('ghl_sync_state')
              .update({ last_error: `no_ghl_access_token: org ${locationLink.org_id}`, updated_at: new Date().toISOString() })
              .eq('id', syncStateId)
          } else {
            await ghlPut(token, `/contacts/${contactId}`, {
              customFields: [{ id: config.fieldIds.prezvaAttendeeLink, value: entryUrl }],
            })
          }
        }
      } catch (e) {
        console.error('[ghl-payment] failed to write entryUrl to contact', contactId, e)
      }
    }

    return NextResponse.json({ status: 'accepted', registrationId: result.registrationId, entryUrl })
  } catch (err) {
    console.error('[ghl-webhook] Unexpected error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
