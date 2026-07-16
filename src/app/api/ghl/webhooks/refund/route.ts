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
    // GHL sends order amounts in dollars (see payment/route.ts:52 — same
    // Math.round(Number(x) * 100) conversion for order.total_price). The
    // amount_paid_cents fallback is already cents and needs no conversion.
    const refundObj = body.refund as Record<string, unknown> | undefined
    let field: string
    let rawValue: unknown
    let refundAmountCents: number

    if (typeof refundObj?.amount === 'number') {
      field = 'body.refund.amount'
      rawValue = refundObj.amount
      refundAmountCents = Math.round(Number(rawValue) * 100)
    } else if (typeof body.amount_refunded === 'number') {
      field = 'body.amount_refunded'
      rawValue = body.amount_refunded
      refundAmountCents = Math.round(Number(rawValue) * 100)
    } else if (typeof body.refundAmount === 'number') {
      field = 'body.refundAmount'
      rawValue = body.refundAmount
      refundAmountCents = Math.round(Number(rawValue) * 100)
    } else {
      field = 'fallback:amount_paid_cents'
      rawValue = undefined
      refundAmountCents = reg.amount_paid_cents ?? 0
    }
    const isFullRefund = refundAmountCents >= (reg.amount_paid_cents ?? 0)

    console.log('[ghl-refund] amount resolution:', {
      field,
      rawValue,
      computedCents: refundAmountCents,
      amountPaidCents: reg.amount_paid_cents,
      isFullRefund,
    })

    // 7. Write refund state (mirrors the Stripe webhook: refund_amount_cents
    // always, status/refunded_at only on a full refund). The update itself is
    // the idempotency guard — .neq('status', 'refunded') closes the race where
    // two concurrent deliveries both read a pre-refund status before either
    // writes; only the request whose update actually flips a row may enqueue.
    const { data: updated } = await supabase
      .from('registrations')
      .update({
        ...(isFullRefund ? { status: 'refunded', refunded_at: new Date().toISOString() } : {}),
        refund_amount_cents: refundAmountCents,
      })
      .eq('id', reg.id)
      .neq('status', 'refunded')
      .select('id')
      .maybeSingle()

    if (!updated) {
      console.log('[ghl-refund] lost the race to a concurrent refund — no-op:', reg.id)
      return NextResponse.json({ ok: true, status: 'already_refunded' })
    }

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
