import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

// ── Task: send registration confirmation email ────────────────────────────────
export const sendConfirmationEmail = schemaTask({
  id: 'send-registration-confirmation',
  schema: z.object({
    registrationId: z.string(),
    attendeeEmail:  z.string().email(),
    attendeeName:   z.string(),
    eventTitle:     z.string(),
    eventStartAt:   z.string(),
    eventVenue:     z.string().optional(),
    qrCode:         z.string(),
    orgName:        z.string(),
  }),
  run: async (payload) => {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:#00BFA6;margin:0;font-size:1.5rem;">You're registered!</h1>
        </div>
        <div style="background:#112240;padding:24px;border-radius:0 0 12px 12px;color:#F0F4F8;">
          <p>Hi ${payload.attendeeName},</p>
          <p>Your registration for <strong>${payload.eventTitle}</strong> is confirmed.</p>
          ${payload.eventVenue ? `<p>📍 ${payload.eventVenue}</p>` : ''}
          <p>📅 ${new Date(payload.eventStartAt).toLocaleString('en-US', {
            dateStyle: 'full', timeStyle: 'short',
          })}</p>
          <div style="background:#0D1B2A;border:1px solid #1E3A5F;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
            <p style="color:#94A3B8;font-size:0.875rem;margin:0 0 8px;">Your check-in QR code</p>
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payload.qrCode)}"
              alt="QR Code" width="160" style="border-radius:4px;"
            />
            <p style="color:#64748B;font-size:0.75rem;margin:8px 0 0;font-family:monospace;">
              ${payload.qrCode}
            </p>
          </div>
          <p style="color:#94A3B8;font-size:0.875rem;">
            Powered by ${payload.orgName} via Prezva
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
        from:    `${payload.orgName} <events@prezva.app>`,
        to:      payload.attendeeEmail,
        subject: `✅ You're registered for ${payload.eventTitle}`,
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
  }),
  run: async (payload) => {
    // Full waitlist promotion logic added in Task 33 Registration module.
    // Infrastructure is wired; body will be filled when Registration is built.
    return { processed: true, eventId: payload.eventId }
  },
})
