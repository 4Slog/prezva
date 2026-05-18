'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

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

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const { stripe } = await import('@/lib/stripe/client')
  try {
    // stripe_charge_id may store either a payment_intent (pi_...) or charge (ch_...) ID
    // depending on how the payment was captured. Handle both.
    const chargeId = reg.stripe_charge_id as string
    const refundParams: Record<string, string> = { reason: 'requested_by_customer' }
    if (chargeId.startsWith('pi_')) {
      refundParams.payment_intent = chargeId
    } else {
      refundParams.charge = chargeId
    }
    const refund = await stripe.refunds.create(refundParams as any)
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

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

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

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

  const admin = createAdminClient()
  const { error } = await admin
    .from('registrations')
    .update({ status: 'cancelled' })
    .eq('id', registrationId)

  if (error) return { error: error.message }
  return { ok: true }
}

export async function approveRegistration(registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, status, attendee_email, attendee_name, qr_code, event_id, events(title, slug, start_at, venue_name, venue_city, venue_state, organizations(id, name))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  if (reg.status !== 'pending') return { error: 'Registration is not pending' }

  const ev = reg.events as any
  const orgId = ev?.organizations?.id
  if (!orgId) return { error: 'Could not determine organization' }

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const admin = createAdminClient()
  await admin
    .from('registrations')
    .update({ status: 'confirmed', confirmation_sent_at: new Date().toISOString() })
    .eq('id', registrationId)

  // Send confirmation email
  const { enqueueConfirmationEmail } = await import('@/lib/trigger')
  const orgName = ev?.organizations?.name ?? 'Prezva'
  await enqueueConfirmationEmail({
    registrationId: reg.id,
    attendeeEmail: reg.attendee_email,
    attendeeName: reg.attendee_name,
    eventTitle: ev.title,
    eventStartAt: ev.start_at,
    eventSlug: ev.slug,
    eventVenue: [ev.venue_name, ev.venue_city, ev.venue_state].filter(Boolean).join(', ') || undefined,
    qrCode: reg.qr_code,
    orgName,
  })

  return { ok: true }
}

export async function rejectRegistration(registrationId: string, reason?: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, status, attendee_email, attendee_name, event_id, events(title, slug, organizations(id, name))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  if (reg.status !== 'pending') return { error: 'Registration is not pending' }

  const ev = reg.events as any
  const orgId = ev?.organizations?.id
  if (!orgId) return { error: 'Could not determine organization' }

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const admin = createAdminClient()
  await admin
    .from('registrations')
    .update({ status: 'cancelled' })
    .eq('id', registrationId)

  const orgName = ev?.organizations?.name ?? 'Prezva'
  const reasonText = reason ? `<p style="font-size:15px;">Reason: ${reason}</p>` : ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <span style="color:#0D1B2A;font-weight:900;font-size:18px;background:#00BFA6;padding:4px 10px;border-radius:6px;">P</span>
        <h1 style="color:#F0F4F8;font-size:22px;margin:12px 0 0;">Registration update</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p style="font-size:15px;">Hi ${reg.attendee_name},</p>
        <p style="font-size:15px;">We're sorry — your registration for <strong style="color:#F0F4F8;">${ev.title}</strong> was not approved.</p>
        ${reasonText}
        <p style="font-size:15px;">If you have questions, please contact the event organizer.</p>
        <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
        <p style="color:#475569;font-size:12px;">Sent by ${orgName} via <a href="${appUrl}" style="color:#00BFA6;">Prezva</a>.</p>
      </div>
    </div>
  `
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${orgName} <noreply@prezva.app>`, to: reg.attendee_email, subject: `${orgName}: Registration update for ${ev.title}`, html }),
  })

  return { ok: true }
}

export async function selfCancelRegistration(registrationId: string) {
  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: reg } = await admin
    .from('registrations')
    .select('id, status, user_id, amount_paid_cents, attendee_email, attendee_name, event_id, events(title, slug, start_at, organizations(name))')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  if (!['confirmed', 'waitlisted'].includes(reg.status)) return { error: 'This registration cannot be cancelled' }

  const ev = reg.events as any
  if (ev?.start_at && new Date(ev.start_at) <= new Date()) return { error: 'This event has already started' }

  // Authorization: must own this registration
  if (user) {
    if (reg.user_id !== user.id) return { error: 'Not authorized' }
  } else {
    // Guest: verify via cookie token
    const { cookies } = await import('next/headers')
    const jar = await cookies()
    const slug = ev?.slug as string | undefined
    const cookieVal = slug ? jar.get(`pz_reg_${slug}`)?.value : undefined
    if (cookieVal !== registrationId) return { error: 'Not authorized' }
  }

  const isPaid = (reg.amount_paid_cents ?? 0) > 0
  const newStatus = isPaid ? 'cancellation_requested' : 'cancelled'

  await admin.from('registrations').update({ status: newStatus }).eq('id', registrationId)

  const orgName = (ev?.organizations as any)?.name ?? 'Prezva'
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <span style="color:#0D1B2A;font-weight:900;font-size:18px;background:#00BFA6;padding:4px 10px;border-radius:6px;">P</span>
        <h1 style="color:#F0F4F8;font-size:22px;margin:12px 0 0;">Registration ${isPaid ? 'cancellation requested' : 'cancelled'}</h1>
      </div>
      <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
        <p style="font-size:15px;">Hi ${reg.attendee_name},</p>
        ${isPaid
          ? `<p style="font-size:15px;">Your cancellation request for <strong style="color:#F0F4F8;">${ev.title}</strong> has been received. The organizer will process your refund per their policy.</p>`
          : `<p style="font-size:15px;">Your registration for <strong style="color:#F0F4F8;">${ev.title}</strong> has been cancelled.</p>`
        }
        <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
        <p style="color:#475569;font-size:12px;">Sent by ${orgName} via <a href="${appUrl}" style="color:#00BFA6;">Prezva</a>.</p>
      </div>
    </div>
  `
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${orgName} <noreply@prezva.app>`, to: reg.attendee_email, subject: `${orgName}: Registration ${isPaid ? 'cancellation requested' : 'cancelled'} — ${ev.title}`, html }),
  })

  if (isPaid) {
    // Notify organizer
    const { data: orgOwner } = await admin
      .from('org_members')
      .select('users(email)')
      .eq('org_id', (await admin.from('events').select('org_id').eq('id', reg.event_id).single()).data?.org_id ?? '')
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle()
    const orgEmail = (orgOwner?.users as any)?.email
    if (orgEmail) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'noreply@prezva.app',
          to: orgEmail,
          subject: `Cancellation request: ${reg.attendee_name} — ${ev.title}`,
          html: `<p>${reg.attendee_name} (${reg.attendee_email}) has requested a cancellation for ${ev.title}. Please process the refund via your Stripe dashboard.</p>`,
        }),
      })
    }
  }

  return { ok: true, isPaid }
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

  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

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
