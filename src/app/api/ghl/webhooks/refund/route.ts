import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueWaitlistProcessing } from '@/lib/trigger'

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

    // 2. Parse body. Nobody has seen a real GHL Refund webhook body yet, so log
    // it in full before touching it — this log is the point of the first firing.
    let rawBody: string
    let body: Record<string, unknown>
    try {
      rawBody = await req.text()
      console.log('[ghl-refund] raw payload:', rawBody)
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
    }

    // 3. Resolve the GHL order id by trying candidate paths in order.
    const order = body.order as Record<string, unknown> | undefined
    const lineItems = Array.isArray(order?.line_items) ? (order!.line_items as Record<string, unknown>[]) : []
    const firstItem = lineItems[0] as Record<string, unknown> | undefined
    const meta = firstItem?.meta as Record<string, unknown> | undefined

    let ghlOrderId: string | undefined
    if (typeof meta?.order_id === 'string') {
      ghlOrderId = meta.order_id
      console.log('[ghl-refund] order id resolved via body.order.line_items[0].meta.order_id:', ghlOrderId)
    } else if (typeof order?._id === 'string') {
      ghlOrderId = order._id
      console.log('[ghl-refund] order id resolved via body.order._id:', ghlOrderId)
    } else if (typeof order?.id === 'string') {
      ghlOrderId = order.id
      console.log('[ghl-refund] order id resolved via body.order.id:', ghlOrderId)
    } else if (typeof body.orderId === 'string') {
      ghlOrderId = body.orderId
      console.log('[ghl-refund] order id resolved via body.orderId:', ghlOrderId)
    } else if (typeof body._id === 'string') {
      ghlOrderId = body._id
      console.log('[ghl-refund] order id resolved via body._id:', ghlOrderId)
    }

    if (!ghlOrderId) {
      console.log('[ghl-refund] unresolved order id')
      return NextResponse.json({ ok: false, reason: 'unresolved_order_id' })
    }

    const supabase = createAdminClient()

    // 4. Look up the registration by external_order_id.
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, event_id, amount_paid_cents, status, events(title, slug)')
      .eq('external_order_id', ghlOrderId)
      .maybeSingle()

    if (!reg) {
      console.log('[ghl-refund] registration_not_found for order id:', ghlOrderId)
      return NextResponse.json({ ok: false, reason: 'registration_not_found' })
    }

    // 5. Idempotency — a duplicate delivery on an already-refunded registration
    // must not enqueue anything (the enqueue promotes a waitlisted attendee and
    // emails them; doing it twice emails a second person).
    if (reg.status === 'refunded') {
      console.log('[ghl-refund] already refunded — no-op:', reg.id)
      return NextResponse.json({ ok: true, status: 'already_refunded' })
    }

    // 6. Determine the refunded amount. The payload shape is unknown — try a
    // few plausible fields (logging which one hit) before defaulting to a full
    // refund of the amount on record.
    const refundObj = body.refund as Record<string, unknown> | undefined
    let refundAmountCents: number
    let isFullRefund: boolean

    if (typeof refundObj?.amount === 'number') {
      refundAmountCents = Math.round(refundObj.amount)
      console.log('[ghl-refund] refund amount resolved via body.refund.amount:', refundAmountCents)
    } else if (typeof body.amount_refunded === 'number') {
      refundAmountCents = Math.round(body.amount_refunded)
      console.log('[ghl-refund] refund amount resolved via body.amount_refunded:', refundAmountCents)
    } else if (typeof body.refundAmount === 'number') {
      refundAmountCents = Math.round(body.refundAmount)
      console.log('[ghl-refund] refund amount resolved via body.refundAmount:', refundAmountCents)
    } else {
      refundAmountCents = reg.amount_paid_cents ?? 0
      console.log('[ghl-refund] no determinable refund amount in payload — treating as full refund of amount_paid_cents:', refundAmountCents)
    }
    isFullRefund = refundAmountCents >= (reg.amount_paid_cents ?? 0)

    // 7. Write refund state (mirrors the Stripe webhook: refund_amount_cents
    // always, status/refunded_at only on a full refund).
    await supabase
      .from('registrations')
      .update({
        ...(isFullRefund ? { status: 'refunded', refunded_at: new Date().toISOString() } : {}),
        refund_amount_cents: refundAmountCents,
      })
      .eq('id', reg.id)

    // 8. Full refund frees a confirmed seat — promote next waitlisted attendee.
    // GHL already moved the money — no Stripe call, no ghlPut, no stage/tag change.
    if (isFullRefund) {
      const ev = (reg.events ?? null) as unknown as { title: string; slug: string } | null
      if (reg.event_id && ev) {
        await enqueueWaitlistProcessing({ eventId: reg.event_id, eventTitle: ev.title, eventSlug: ev.slug })
      } else {
        console.log('[ghl-refund] full refund but event title/slug unresolved — seat NOT freed')
      }
    }

    return NextResponse.json({ ok: true, status: isFullRefund ? 'refunded' : 'partial_refund' })
  } catch (err) {
    console.error('[ghl-refund] Unexpected error:', err)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
