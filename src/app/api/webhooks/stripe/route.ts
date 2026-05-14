import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { enqueueConfirmationEmail } from '@/lib/trigger'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig  = req.headers.get('stripe-signature')

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

  const supabase = await createClient()

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
        amount_paid_cents:    session.amount_total ?? 0,
        confirmation_sent_at: new Date().toISOString(),
      })
      .eq('id', regId)
      .eq('status', 'pending') // idempotency guard
      .select('*, events(title, slug, start_at, venue_name, venue_city, venue_state, organizations(name))')
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
    const org = ev?.organizations as { name: string } | null
    await enqueueConfirmationEmail({
      registrationId: reg.id,
      attendeeEmail:  reg.attendee_email,
      attendeeName:   reg.attendee_name,
      eventTitle:     ev?.title as string ?? '',
      eventStartAt:   ev?.start_at as string ?? '',
      eventSlug:      ev?.slug as string ?? '',
      eventVenue:     [ev?.venue_name, ev?.venue_city, ev?.venue_state]
        .filter(Boolean).join(', ') || undefined,
      qrCode:  reg.qr_code,
      orgName: org?.name ?? 'Prezva',
    })
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object
    const regId   = session.metadata?.registration_id
    if (regId) {
      await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', regId)
        .eq('status', 'pending')
    }
  }

  if (event.type === 'payment_intent.payment_failed') {
    const pi    = event.data.object
    const regId = pi.metadata?.registration_id
    if (regId) {
      await supabase
        .from('registrations')
        .update({ status: 'cancelled' })
        .eq('id', regId)
        .eq('status', 'pending')
    }
  }

  // Connect account updated — sync capability flags to org row
  if (event.type === 'account.updated') {
    const account = event.data.object
    await supabase
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
    await supabase
      .from('organizations')
      .update({ stripe_account_id: null })
      .eq('stripe_account_id', account.id)
  }

  return NextResponse.json({ received: true })
}
