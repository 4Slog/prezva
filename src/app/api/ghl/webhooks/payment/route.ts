import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createRegistrationFromExternalPayment,
} from '@/lib/registration/actions'
import { enqueueGhlSync } from '@/lib/trigger'
import { parsePaymentWebhookInput } from '@/lib/ghl/sanitize-payment-input'

export const runtime = 'nodejs'

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify shared secret
    const secret = req.nextUrl.searchParams.get('secret')
    const envSecret = process.env.GHL_WEBHOOK_SECRET
    if (!secret || !envSecret || !secretsMatch(secret, envSecret)) {
      return new NextResponse(null, { status: 401 })
    }

    // 2. Parse body
    let body: Record<string, unknown>
    try {
      body = await req.json()
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

    const parsed = parsePaymentWebhookInput({
      ghlOrderId:     meta?.order_id as string | undefined,
      locationId:     location?.id as string | undefined,
      contactId:      body.contact_id as string | undefined,
      attendeeEmail:  body.email as string | undefined,
      attendeeName:   body.full_name as string | undefined,
      attendeePhone:  body.phone as string | undefined,
      productId:      meta?.product_id as string | undefined,
      priceId:        meta?.price_id as string | undefined,
      amountPaidCents: order?.total_price,
    })
    if (!parsed.ok) return parsed.response

    const { ghlOrderId, locationId, contactId, attendeeEmail, attendeeName, attendeePhone, productId, priceId, amountPaidCents } = parsed.data

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

    const { data: mapping } = await supabase
      .from('ticket_type_product_mappings')
      .select('ticket_type_id, event_id')
      .eq('ghl_product_id', productId)
      .eq('ghl_price_id', priceId)
      .maybeSingle()

    if (mapping) {
      ticketTypeId = mapping.ticket_type_id
      eventId      = mapping.event_id

      // Fetch ticket title + event title for the sync task
      const [{ data: ttRow }, { data: evRow }] = await Promise.all([
        supabase.from('ticket_types').select('name').eq('id', ticketTypeId!).maybeSingle(),
        supabase.from('events').select('title').eq('id', eventId!).maybeSingle(),
      ])
      ticketTypeTitle = ttRow?.name ?? null
      eventTitle      = evRow?.title ?? null
    }

    if (!ticketTypeId || !eventId) {
      console.warn(`[ghl-webhook] No ticket mapping for product=${productId} price=${priceId}`)
      await supabase
        .from('ghl_sync_state')
        .update({ status: 'failed', last_error: 'ticket_not_mapped', updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return NextResponse.json({ error: 'ticket_not_mapped' }, { status: 400 })
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
      attendeeName,
      amountPaidCents,
      paymentStatus:   'paid',
      syncStateId,
    })

    return NextResponse.json({ status: 'accepted', registrationId: result.registrationId })
  } catch (err) {
    console.error('[ghl-webhook] Unexpected error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
