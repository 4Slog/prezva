'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export async function transferRegistration(
  registrationId: string,
  newFirstName: string,
  newLastName: string,
  newEmail: string,
) {
  const admin = createAdminClient()
  void createClient
  const user = await requireUser()

  const { data: reg } = await admin
    .from('registrations')
    .select('id, user_id, status, checked_in_at, event_id, attendee_name, attendee_email, events(title, slug)')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { error: 'Registration not found' }
  if ((reg as any).user_id !== user.id) return { error: 'You can only transfer your own registrations' }
  if ((reg as any).checked_in_at) return { error: 'Cannot transfer after check-in' }
  if (!['confirmed', 'pending'].includes((reg as any).status)) return { error: 'This registration cannot be transferred' }

  const { nanoid } = await import('nanoid')
  const newQrCode = nanoid(32)
  const newName = `${newFirstName} ${newLastName}`.trim()

  const { error: updateError } = await admin
    .from('registrations')
    .update({
      attendee_name: newName,
      attendee_email: newEmail.toLowerCase(),
      qr_code: newQrCode,
      user_id: null,
    })
    .eq('id', registrationId)

  if (updateError) return { error: updateError.message }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const eventSlug = (reg as any).events?.slug
  const eventTitle = (reg as any).events?.title ?? 'the event'
  const confirmUrl = eventSlug ? `${appUrl}/e/${eventSlug}/confirmation?reg=${registrationId}` : appUrl

  await Promise.allSettled([
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Prezva <noreply@prezva.app>',
        to: newEmail.toLowerCase(),
        subject: `You've received a ticket for ${eventTitle}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Ticket transferred to you</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p>Hi ${newFirstName},</p>
            <p>A ticket for <strong style="color:#F0F4F8;">${eventTitle}</strong> has been transferred to you.</p>
            <p><a href="${confirmUrl}" style="color:#00BFA6;">View your ticket</a></p>
            <p style="color:#475569;font-size:12px;">Powered by <a href="https://prezva.app" style="color:#00BFA6;">Prezva</a></p>
          </div>
        </div>`,
      }),
    }),
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Prezva <noreply@prezva.app>',
        to: (reg as any).attendee_email,
        subject: `Your ticket for ${eventTitle} has been transferred`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Ticket transfer confirmed</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p>Your ticket for <strong style="color:#F0F4F8;">${eventTitle}</strong> has been transferred to ${newName}.</p>
            <p style="color:#475569;font-size:12px;">Powered by <a href="https://prezva.app" style="color:#00BFA6;">Prezva</a></p>
          </div>
        </div>`,
      }),
    }),
  ])

  return { ok: true }
}
