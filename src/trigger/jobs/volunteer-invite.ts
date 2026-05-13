import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

export const sendVolunteerInviteEmail = schemaTask({
  id: 'send-volunteer-invite',
  schema: z.object({
    volunteerName:  z.string(),
    volunteerEmail: z.string().email(),
    volunteerRole:  z.string(),
    eventTitle:     z.string(),
    eventDate:      z.string(),
    shiftStart:     z.string().nullable(),
    shiftEnd:       z.string().nullable(),
    portalUrl:      z.string(),
  }),
  run: async (payload) => {
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const shiftLine = payload.shiftStart
      ? `<p>⏰ Your shift: ${new Date(payload.shiftStart).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${payload.shiftEnd ? ' – ' + new Date(payload.shiftEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</p>`
      : ''

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:#00BFA6;margin:0;font-size:1.5rem;">Volunteer Invitation</h1>
        </div>
        <div style="background:#112240;padding:24px;border-radius:0 0 12px 12px;color:#F0F4F8;">
          <p>Hi ${payload.volunteerName},</p>
          <p>You've been invited to volunteer at <strong>${payload.eventTitle}</strong>.</p>
          <p>📋 Role: <strong>${payload.volunteerRole}</strong></p>
          <p>📅 Event date: ${fmtDate(payload.eventDate)}</p>
          ${shiftLine}
          <div style="margin:24px 0;">
            <a href="${payload.portalUrl}"
               style="background:#00BFA6;color:#0D1B2A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">
              Access Your Volunteer Portal
            </a>
          </div>
          <p style="color:#94A3B8;font-size:0.875rem;">
            Your portal lets you clock in/out and access role-specific tools. No Prezva account required — just use the link above.
          </p>
          <p style="color:#94A3B8;font-size:0.875rem;">Powered by Prezva</p>
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
        from:    'Prezva Events <events@prezva.app>',
        to:      payload.volunteerEmail,
        subject: `You're invited to volunteer at ${payload.eventTitle}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend failed (${res.status}): ${err}`)
    }

    const data = (await res.json()) as { id: string }
    return { emailId: data.id, sentTo: payload.volunteerEmail }
  },
})
