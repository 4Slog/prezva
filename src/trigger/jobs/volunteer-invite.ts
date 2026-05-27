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
    orgEmail:       z.string().email().optional(),
  }),
  run: async (payload) => {
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const shiftLine = payload.shiftStart
      ? `<li>⏰ <strong>Shift:</strong> ${new Date(payload.shiftStart).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${payload.shiftEnd ? ' – ' + new Date(payload.shiftEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</li>`
      : ''

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
          <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
          </div>
          <h1 style="color:#F0F4F8;font-size:20px;margin:0;">You're Volunteering at ${payload.eventTitle}</h1>
        </div>
        <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
          <p style="font-size:15px;">Hi ${payload.volunteerName},</p>
          <p style="font-size:15px;">Thank you for giving your time to <strong style="color:#F0F4F8;">${payload.eventTitle}</strong>. Here's everything you need to know before the event:</p>
          <ul style="padding-left:20px;line-height:1.8;font-size:15px;">
            <li>📋 <strong>Your role:</strong> ${payload.volunteerRole}</li>
            <li>📅 <strong>Event date:</strong> ${fmtDate(payload.eventDate)}</li>
            ${shiftLine}
            <li>🔑 Your volunteer portal gives you clock-in/out, role briefings, and day-of contacts</li>
            <li>📱 Save this email — your portal link is below</li>
          </ul>
          <div style="margin:24px 0;">
            <a href="${payload.portalUrl}"
               style="background:#00BFA6;color:#0D1B2A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
              Access Your Volunteer Portal
            </a>
          </div>
          <p style="color:#94A3B8;font-size:13px;">
            No Prezva account needed — your portal link is all you need. It stays active through the event.
          </p>
          <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
          <p style="color:#475569;font-size:12px;margin:0;">
            Questions? Reply to this email or reach out to the event organizer directly.
          </p>
        </div>
      </div>
    `

    const shiftText = payload.shiftStart
      ? `Shift: ${new Date(payload.shiftStart).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}${payload.shiftEnd ? ' – ' + new Date(payload.shiftEnd).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}`
      : ''

    const text = [
      `Hi ${payload.volunteerName},`,
      ``,
      `Thank you for giving your time to ${payload.eventTitle}. Here's what you need before the event:`,
      ``,
      `Your role:   ${payload.volunteerRole}`,
      `Event date:  ${fmtDate(payload.eventDate)}`,
      shiftText,
      ``,
      `Your volunteer portal gives you clock-in/out, role briefings, and day-of contacts.`,
      `Save this email — your portal link is below.`,
      ``,
      `Access your portal: ${payload.portalUrl}`,
      ``,
      `No Prezva account needed — your portal link stays active through the event.`,
      ``,
      `Questions? Reply to this email or reach out to the event organizer directly.`,
    ].filter(Boolean).join('\n')

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     'Prezva Events <noreply@prezva.app>',
        to:       payload.volunteerEmail,
        subject:  `You're volunteering at ${payload.eventTitle} — here's your portal`,
        html,
        text,
        reply_to: payload.orgEmail || undefined,
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
