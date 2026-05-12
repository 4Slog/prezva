import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

export const sendCertificateEmail = schemaTask({
  id: 'send-certificate-email',
  schema: z.object({
    registrationId: z.string(),
    attendeeEmail: z.string().email(),
    attendeeName: z.string(),
    eventTitle: z.string(),
    certDownloadUrl: z.string().url(),
    verifyUrl: z.string().url(),
    ceCredits: z.number().optional(),
  }),
  run: async (payload) => {
    const { Resend } = await import('resend')
    const resend = new Resend(process.env.RESEND_API_KEY)

    const ceText = payload.ceCredits && payload.ceCredits > 0
      ? `<p style="color:#94A3B8;">This certificate represents <strong style="color:#F0F4F8;">${payload.ceCredits} CE credit hours</strong>.</p>`
      : ''

    await resend.emails.send({
      from: 'Prezva <certificates@prezva.app>',
      to: payload.attendeeEmail,
      subject: `Your certificate for ${payload.eventTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px;border-radius:12px 12px 0 0;">
            <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
            </div>
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Your Certificate is Ready 🎓</h1>
          </div>
          <div style="background:#0F2236;padding:24px;border-radius:0 0 12px 12px;">
            <p style="color:#94A3B8;">Hi ${payload.attendeeName},</p>
            <p style="color:#94A3B8;">Congratulations on completing <strong style="color:#F0F4F8;">${payload.eventTitle}</strong>! Your certificate of attendance is now available.</p>
            ${ceText}
            <div style="margin:24px 0;">
              <a href="${payload.certDownloadUrl}" style="background:#00BFA6;color:#0D1B2A;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
                Download Certificate (PDF)
              </a>
            </div>
            <p style="color:#64748B;font-size:12px;">
              Verify this certificate at: <a href="${payload.verifyUrl}" style="color:#00BFA6;">${payload.verifyUrl}</a>
            </p>
          </div>
        </div>
      `,
    })

    return { sent: true }
  },
})
