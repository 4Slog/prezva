// IMPORTANT: This webhook endpoint must be registered in Stripe Dashboard
// with "Events from: Connected accounts" enabled (already done May 16 2026).
// Required events: checkout.session.completed, checkout.session.expired,
// payment_intent.payment_failed, charge.refunded, account.updated,
// account.application.deauthorized
// Stripe sends a Stripe-Account header identifying which connected account
// triggered the event. We capture it below for logging purposes.

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueConfirmationEmail, enqueueWaitlistProcessing } from '@/lib/trigger'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig                = req.headers.get('stripe-signature')
  const connectedAccountId = req.headers.get('stripe-account') ?? undefined

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createAdminClient()

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const meta    = session.metadata ?? {}
    const regId   = meta.registration_id

    if (!regId) {
      return NextResponse.json({ error: 'No registration_id in metadata' }, { status: 400 })
    }

    // Confirm the registration
    const { data: reg, error } = await supabase
      .from('registrations')
      .update({
        status:               'confirmed',
        stripe_charge_id:     session.payment_intent as string,
        stripe_session_id:    session.id,
        amount_paid_cents:    session.amount_total ?? 0,
        confirmation_sent_at: new Date().toISOString(),
      })
      .eq('id', regId)
      .eq('status', 'pending') // idempotency guard
      .select('*, events(title, slug, start_at, venue_name, venue_city, venue_state, virtual_url, event_type, organizations(name, email))')
      .single()

    if (error || !reg) {
      // Already confirmed (duplicate webhook) — return 200 to prevent retries
      return NextResponse.json({ received: true })
    }

    // Increment discount code usage if applicable
    if (reg.discount_code_id) {
      await supabase.rpc('increment_discount_uses', { code_id: reg.discount_code_id })
    }

    // Enqueue confirmation email
    const ev  = reg.events as Record<string, unknown>
    const org = ev?.organizations as { name: string; email?: string | null } | null
    await enqueueConfirmationEmail({
      registrationId: reg.id,
      attendeeEmail:  reg.attendee_email,
      attendeeName:   reg.attendee_name,
      eventTitle:     ev?.title as string ?? '',
      eventStartAt:   ev?.start_at as string ?? '',
      eventSlug:      ev?.slug as string ?? '',
      eventVenue:     [ev?.venue_name, ev?.venue_city, ev?.venue_state]
        .filter(Boolean).join(', ') || undefined,
      qrCode:     reg.qr_code,
      orgName:    org?.name ?? 'Prezva',
      orgEmail:   org?.email || undefined,
      virtualUrl: (ev?.virtual_url as string) || undefined,
      eventType:  (ev?.event_type as string) || undefined,
      pressToken: ((reg as Record<string, unknown>).press_token as string) || undefined,
    })
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object
    const regId   = session.metadata?.registration_id
    if (regId) {
      const { data: cancelled } = await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', regId)
        .eq('status', 'pending')
        .select('event_id, events(title, slug)')
        .maybeSingle()
      const ev = (cancelled?.events ?? null) as unknown as { title: string; slug: string } | null
      if (cancelled?.event_id && ev) {
        await enqueueWaitlistProcessing({ eventId: cancelled.event_id, eventTitle: ev.title, eventSlug: ev.slug })
      }
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi    = event.data.object
    const regId = pi.metadata?.registration_id
    if (regId) {
      const { data: cancelled } = await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', regId)
        .eq('status', 'pending')
        .select('event_id, events(title, slug)')
        .maybeSingle()
      const ev = (cancelled?.events ?? null) as unknown as { title: string; slug: string } | null
      if (cancelled?.event_id && ev) {
        await enqueueWaitlistProcessing({ eventId: cancelled.event_id, eventTitle: ev.title, eventSlug: ev.slug })
      }
    }
  }

  // Connect account updated — sync capability flags to org row
  // Must use admin client: no user session in webhook context, orgs_update_owner RLS would block
  if (event.type === 'account.updated') {
    const account = event.data.object
    const admin = createAdminClient()
    await admin
      .from('organizations')
      .update({
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
      })
      .eq('stripe_account_id', account.id)
  }

  // Connect account deauthorized — clear stripe_account_id from org
  if (event.type === 'account.application.deauthorized') {
    const account = event.data.object as { id: string }
    const admin = createAdminClient()
    await admin
      .from('organizations')
      .update({ stripe_account_id: null })
      .eq('stripe_account_id', account.id)
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object
    // stripe_charge_id stores the payment_intent ID (pi_...) — match on either
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, event_id, amount_paid_cents, status, events(title, slug)')
      .or(`stripe_charge_id.eq.${charge.payment_intent},stripe_charge_id.eq.${charge.id}`)
      .maybeSingle()

    if (reg && reg.status !== 'refunded') {
      const isFullRefund = charge.amount_refunded >= charge.amount
      await supabase
        .from('registrations')
        .update({
          ...(isFullRefund ? { status: 'refunded', refunded_at: new Date().toISOString() } : {}),
          refund_amount_cents: charge.amount_refunded,
        })
        .eq('id', reg.id)

      // Full refund frees a confirmed seat — promote next waitlisted attendee
      if (isFullRefund && reg.event_id) {
        const ev = (reg.events ?? null) as unknown as { title: string; slug: string } | null
        if (ev) {
          await enqueueWaitlistProcessing({ eventId: reg.event_id, eventTitle: ev.title, eventSlug: ev.slug })
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
