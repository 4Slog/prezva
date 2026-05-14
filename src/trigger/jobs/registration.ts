import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

// ── Task: send registration confirmation email ────────────────────────────────
export const sendConfirmationEmail = schemaTask({
  id: 'send-registration-confirmation',
  schema: z.object({
    registrationId: z.string(),
    attendeeEmail:  z.string().email(),
    attendeeName:   z.string(),
    eventTitle:     z.string(),
    eventStartAt:   z.string(),
    eventSlug:      z.string(),
    agendaUrl:      z.string().optional(),
    eventVenue:     z.string().optional(),
    qrCode:         z.string(),
    orgName:        z.string(),
  }),
  run: async (payload) => {
    const dateStr = new Date(payload.eventStartAt).toLocaleString('en-US', {
      dateStyle: 'full', timeStyle: 'short',
    })
    const agendaLink = payload.agendaUrl ?? `${BASE_URL}/e/${payload.eventSlug}/agenda`
    const icsUrl     = `${BASE_URL}/e/${payload.eventSlug}/calendar.ics`
    const eventUrl   = `${BASE_URL}/e/${payload.eventSlug}`

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
          <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
          </div>
          <h1 style="color:#F0F4F8;font-size:22px;margin:0;">You're registered!</h1>
        </div>
        <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
          <p style="font-size:15px;">Hi ${payload.attendeeName},</p>
          <p style="font-size:15px;">Your registration for <strong style="color:#F0F4F8;">${payload.eventTitle}</strong> is confirmed.</p>
          <p style="margin:4px 0;">📅 ${dateStr}</p>
          ${payload.eventVenue ? `<p style="margin:4px 0;">📍 ${payload.eventVenue}</p>` : ''}
          <div style="background:#0D1B2A;border:1px solid #1E3A5F;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
            <p style="color:#94A3B8;font-size:12px;margin:0 0 10px;">Your check-in QR code</p>
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload.qrCode)}"
              alt="QR Code" width="160" style="border-radius:4px;"
            />
            <p style="color:#64748B;font-size:11px;margin:8px 0 0;font-family:monospace;">${payload.qrCode}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
            <tr>
              <td style="padding:6px 0;">
                <a href="${agendaLink}" style="color:#00BFA6;font-size:14px;text-decoration:none;">→ View agenda</a>
              </td>
              <td style="padding:6px 0;">
                <a href="${icsUrl}" style="color:#00BFA6;font-size:14px;text-decoration:none;">→ Add to calendar</a>
              </td>
            </tr>
            ${payload.eventVenue ? `<tr><td colspan="2" style="padding:6px 0;"><a href="https://maps.google.com/?q=${encodeURIComponent(payload.eventVenue)}" style="color:#00BFA6;font-size:14px;text-decoration:none;">→ Get directions</a></td></tr>` : ''}
          </table>
          <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
          <p style="color:#475569;font-size:12px;margin:0;">
            Sent by ${payload.orgName} via <a href="${eventUrl}" style="color:#00BFA6;text-decoration:none;">Prezva</a>.
            Questions? Reply to this email.
          </p>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    `${payload.orgName} <noreply@prezva.app>`,
        to:      payload.attendeeEmail,
        subject: `${payload.orgName}: You're registered for ${payload.eventTitle}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend failed (${res.status}): ${err}`)
    }

    const data = (await res.json()) as { id: string }
    return { emailId: data.id, sentTo: payload.attendeeEmail }
  },
})

// ── Task: notify next person on waitlist when a spot opens ────────────────────
export const processWaitlist = schemaTask({
  id: 'process-waitlist',
  schema: z.object({
    eventId:    z.string(),
    eventTitle: z.string(),
    eventSlug:  z.string().optional(),
  }),
  run: async (payload) => {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Find highest-priority waitlisted registration
    const { data: next } = await supabase
      .from('registrations')
      .select('id, attendee_email, attendee_name, qr_code, waitlist_position')
      .eq('event_id', payload.eventId)
      .eq('status', 'waitlisted')
      .order('waitlist_position', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!next) return { processed: false, reason: 'no waitlisted registrations' }

    // Promote to confirmed
    const { error } = await supabase
      .from('registrations')
      .update({ status: 'confirmed', waitlist_position: null })
      .eq('id', next.id)

    if (error) throw new Error(`Failed to promote waitlisted reg: ${error.message}`)

    const eventUrl = payload.eventSlug ? `${BASE_URL}/e/${payload.eventSlug}` : ''

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
          <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
          </div>
          <h1 style="color:#F0F4F8;font-size:22px;margin:0;">Good news — you're in!</h1>
        </div>
        <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
          <p style="font-size:15px;">Hi ${next.attendee_name},</p>
          <p style="font-size:15px;">A spot opened up for <strong style="color:#F0F4F8;">${payload.eventTitle}</strong> and you've been confirmed off the waitlist.</p>
          <div style="background:#0D1B2A;border:1px solid #1E3A5F;border-radius:8px;padding:16px 20px;margin:20px 0;text-align:center;">
            <p style="color:#94A3B8;font-size:12px;margin:0 0 10px;">Your check-in QR code</p>
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(next.qr_code)}"
              alt="QR Code" width="160" style="border-radius:4px;"
            />
            <p style="color:#64748B;font-size:11px;margin:8px 0 0;font-family:monospace;">${next.qr_code}</p>
          </div>
          ${eventUrl ? `<p style="margin:12px 0;"><a href="${eventUrl}" style="color:#00BFA6;font-size:14px;text-decoration:none;">→ View event page</a></p>` : ''}
          <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
          <p style="color:#475569;font-size:12px;margin:0;">
            Powered by <a href="https://prezva.app" style="color:#00BFA6;text-decoration:none;">Prezva</a>.
            Reply to this email with any questions.
          </p>
        </div>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Prezva <noreply@prezva.app>`,
        to: next.attendee_email,
        subject: `Good news — a spot opened up for ${payload.eventTitle}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend failed (${res.status}): ${err}`)
    }

    return { processed: true, promotedId: next.id, sentTo: next.attendee_email }
  },
})
