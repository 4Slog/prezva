'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { randomBytes, randomInt } from 'node:crypto'
import { z } from 'zod'
import { escapeHtml, safeSubject } from '@/lib/email/escape'

const GHL_TRANSFER_MESSAGE = 'Transfers for this event are handled by the organizer.'

type GhlSourceRow = {
  ghl_attendee_id: string | null
  ghl_order_id: string | null
  events: { org_id: string; ghl_event_id: string | null } | null
}

async function isGhlSourced(admin: ReturnType<typeof createAdminClient>, reg: GhlSourceRow): Promise<string | null> {
  if (reg.ghl_attendee_id || reg.ghl_order_id || reg.events?.ghl_event_id) return GHL_TRANSFER_MESSAGE
  if (!reg.events?.org_id) return 'Could not load this registration. Please try again.'
  const { data: link, error } = await admin
    .from('ghl_location_links')
    .select('ghl_location_id')
    .eq('org_id', reg.events.org_id)
    .limit(1)
    .maybeSingle()
  if (error) return 'Could not load this registration. Please try again.'
  return link ? GHL_TRANSFER_MESSAGE : null
}

export async function transferRegistration(
  registrationId: string,
  newFirstName: string,
  newLastName: string,
  newEmail: string,
) {
  const admin = createAdminClient()
  void createClient
  const user = await requireUser()

  const first = typeof newFirstName === 'string' ? newFirstName.trim().slice(0, 100) : ''
  const last = typeof newLastName === 'string' ? newLastName.trim().slice(0, 100) : ''
  const email = z.string().trim().toLowerCase().email().max(254).safeParse(newEmail)
  if (!first || !email.success) return { error: 'Enter the new attendee’s name and a valid email.' }

  // registrations has no checked_in_at (asking for it failed the read, so every
  // transfer returned "Registration not found"); a door check-in is a
  // check_ins row with no session.
  const { data: reg, error: regError } = await admin
    .from('registrations')
    .select('id, user_id, status, event_id, attendee_name, attendee_email, ghl_attendee_id, ghl_order_id, events(title, slug, org_id, ghl_event_id), check_ins(id, session_id)')
    .eq('id', registrationId)
    .maybeSingle()

  if (regError) return { error: 'Could not load this registration. Please try again.' }
  if (!reg) return { error: 'Registration not found' }
  if ((reg as any).user_id !== user.id) return { error: 'You can only transfer your own registrations' }

  // E-R6: tickets that came from GHL (or any event on a GHL-linked org) are the
  // organizer's to move — a Prezva-side transfer would desync the GHL contact,
  // order and opportunity. Fails closed if the link cannot be read.
  const ghlBlock = await isGhlSourced(admin, reg as unknown as GhlSourceRow)
  if (ghlBlock) return { error: ghlBlock }

  if (((reg as any).check_ins ?? []).some((c: { session_id: string | null }) => c.session_id === null)) {
    return { error: 'Cannot transfer after check-in' }
  }
  if (!['confirmed', 'pending'].includes((reg as any).status)) return { error: 'This registration cannot be transferred' }

  // Every credential the previous holder had is re-issued, in the column
  // defaults' formats (lowercase hex; 6-digit PIN), so their copy of the QR,
  // PIN, app link or certificate link stops working.
  const hex = () => randomBytes(16).toString('hex')
  const newName = `${first} ${last}`.trim()

  const { data: moved, error: updateError } = await admin
    .from('registrations')
    .update({
      attendee_name: newName,
      attendee_email: email.data,
      qr_code: hex(),
      pin: String(randomInt(1_000_000)).padStart(6, '0'),
      app_access_token: hex(),
      certificate_token: hex(),
      user_id: null,
    })
    .eq('id', registrationId)
    .eq('user_id', user.id)
    .in('status', ['confirmed', 'pending'])
    .select('id')

  if (updateError) return { error: 'Could not transfer this ticket. Please try again.' }
  if (!moved?.length) return { error: 'This registration cannot be transferred' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const eventSlug = (reg as any).events?.slug
  const rawTitle: string = (reg as any).events?.title ?? 'the event'
  const eventTitle = escapeHtml(rawTitle)
  const safeFirst = escapeHtml(first)
  const safeName = escapeHtml(newName)
  const confirmUrl = eventSlug ? `${appUrl}/e/${eventSlug}/confirmation?reg=${registrationId}` : appUrl

  await Promise.allSettled([
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Prezva <noreply@prezva.app>',
        to: email.data,
        subject: safeSubject(`You've received a ticket for ${rawTitle}`),
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Ticket transferred to you</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p>Hi ${safeFirst},</p>
            <p>A ticket for <strong style="color:#F0F4F8;">${eventTitle}</strong> has been transferred to you.</p>
            <p><a href="${confirmUrl}" style="color:#2DD4BF;">View your ticket</a></p>
            <p style="color:#475569;font-size:12px;">Powered by <a href="https://prezva.app" style="color:#2DD4BF;">Prezva</a></p>
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
        subject: safeSubject(`Your ticket for ${rawTitle} has been transferred`),
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Ticket transfer confirmed</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p>Your ticket for <strong style="color:#F0F4F8;">${eventTitle}</strong> has been transferred to ${safeName}.</p>
            <p style="color:#475569;font-size:12px;">Powered by <a href="https://prezva.app" style="color:#2DD4BF;">Prezva</a></p>
          </div>
        </div>`,
      }),
    }),
  ])

  return { ok: true }
}
