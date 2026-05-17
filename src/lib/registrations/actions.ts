'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
// import {

export async function refundRegistration(registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, event_id, stripe_charge_id, amount_paid_cents, status, events(organizations(id))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  if (reg.status === 'refunded') return { error: 'Already refunded' }
  if (!reg.stripe_charge_id) return { error: 'No payment on record — this was a free registration' }
  if ((reg.amount_paid_cents ?? 0) === 0) return { error: 'No amount to refund' }

  const ev = reg.events as any
  const orgId = ev?.organizations?.id
  if (!orgId) return { error: 'Could not determine organization' }

  const { stripe } = await import('@/lib/stripe/client')
  try {
    const refund = await stripe.refunds.create({
      payment_intent: reg.stripe_charge_id,
      reason: 'requested_by_customer',
    })
    if (refund.status !== 'succeeded' && refund.status !== 'pending') {
      return { error: `Refund failed with status: ${refund.status}` }
    }
  } catch (err: any) {
    return { error: `Stripe refund failed: ${err.message}` }
  }

  const admin = createAdminClient()
  await admin
    .from('registrations')
    .update({
      status: 'refunded',
      refunded_at: new Date().toISOString(),
      refund_amount_cents: reg.amount_paid_cents,
    })
    .eq('id', registrationId)

  return { ok: true, refundAmount: reg.amount_paid_cents }
}

export async function resendConfirmation(registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, attendee_email, attendee_name, qr_code, event_id, events(title, slug, organizations(id))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  const ev = reg.events as any
  const orgId = ev?.organizations?.id
  if (!orgId) return { error: 'Could not determine organization' }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  try {
    await resend.emails.send({
      from: 'noreply@prezva.app',
      to: reg.attendee_email,
      subject: `Your registration for ${ev.title}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <p>Hi ${reg.attendee_name.trim().split(/\s+/)[0]},</p>
        <p>This is your confirmation for <strong>${ev.title}</strong>.</p>
        <p><a href="${appUrl}/e/${ev.slug}/confirmation?token=${reg.qr_code}" style="background:#00BFA6;color:#0D1B2A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">View Ticket</a></p>
      </div>`,
    })
    return { ok: true }
  } catch (err: any) {
    return { error: err.message }
  }
}

export async function cancelRegistration(registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, status, event_id, events(organizations(id))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  if (reg.status === 'cancelled') return { error: 'Already cancelled' }

  const ev = reg.events as any
  const orgId = ev?.organizations?.id
  if (!orgId) return { error: 'Could not determine organization' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('registrations')
    .update({ status: 'cancelled' })
    .eq('id', registrationId)

  if (error) return { error: error.message }
  return { ok: true }
}

export async function manualCheckIn(registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, event_id, user_id, events(organizations(id))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }

  const ev = reg.events as any
  const orgId = ev?.organizations?.id
  if (!orgId) return { error: 'Could not determine organization' }

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('registration_id', registrationId)
    .is('session_id', null)
    .maybeSingle()

  if (existing) return { ok: true, alreadyCheckedIn: true }

  const admin = createAdminClient()
  const { error } = await admin
    .from('check_ins')
    .insert({
      registration_id: registrationId,
      event_id: reg.event_id,
      user_id: reg.user_id,
      method: 'manual',
      checked_in_by: user.id,
    })

  if (error) return { error: error.message }
  return { ok: true, alreadyCheckedIn: false }
}
