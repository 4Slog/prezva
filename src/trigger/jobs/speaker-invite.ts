import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

export const sendSpeakerInviteEmail = schemaTask({
  id: 'send-speaker-invite',
  schema: z.object({
    speakerName:  z.string(),
    speakerEmail: z.string().email(),
    eventTitle:   z.string(),
    eventDate:    z.string(),
    portalUrl:    z.string(),
    orgEmail:     z.string().email().optional(),
  }),
  run: async (payload) => {
    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
          <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
            <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
          </div>
          <h1 style="color:#F0F4F8;font-size:20px;margin:0;">You're Speaking at ${payload.eventTitle}</h1>
        </div>
        <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
          <p style="font-size:15px;">Hi ${payload.speakerName},</p>
          <p style="font-size:15px;">We're excited to have you speak at <strong style="color:#F0F4F8;">${payload.eventTitle}</strong> on <strong style="color:#F0F4F8;">${fmtDate(payload.eventDate)}</strong>.</p>
          <p style="font-size:15px;">Your speaker portal gives you access to:</p>
          <ul style="padding-left:20px;line-height:1.8;font-size:15px;">
            <li>📋 Your session details and room assignment</li>
            <li>📎 A/V and slide submission</li>
            <li>👥 Attendee Q&amp;A and engagement tools</li>
            <li>🎟 Complimentary badge and check-in QR code</li>
          </ul>
          <div style="margin:24px 0;">
            <a href="${payload.portalUrl}"
               style="background:#00BFA6;color:#0D1B2A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
              Access Your Speaker Portal
            </a>
          </div>
          <p style="color:#94A3B8;font-size:13px;">
            No Prezva account required — your portal link is all you need. It stays active through the event.
          </p>
          <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
          <p style="color:#475569;font-size:12px;margin:0;">
            Questions about your session? Reply to this email and the organizer will follow up.
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
        from:     'Prezva Events <events@prezva.app>',
        to:       payload.speakerEmail,
        subject:  `You're speaking at ${payload.eventTitle} — here's your portal`,
        html,
        reply_to: payload.orgEmail || undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Resend failed (${res.status}): ${err}`)
    }

    const data = (await res.json()) as { id: string }
    return { emailId: data.id, sentTo: payload.speakerEmail }
  },
})
