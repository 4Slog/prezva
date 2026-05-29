import { schemaTask, logger } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'

type VolunteerRow = {
  name: string | null
  email: string | null
  role: string | null
  shift_start: string | null
  shift_end: string | null
  clocked_in_at: string | null
  clocked_out_at: string | null
}

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;')

function formatHours(ms: number): string {
  const hours = ms / (1000 * 60 * 60)
  if (hours >= 1) {
    const rounded = Math.round(hours * 10) / 10
    return `${rounded} ${rounded === 1 ? 'hour' : 'hours'}`
  }
  const minutes = Math.max(1, Math.round(ms / (1000 * 60)))
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

function hoursContributed(v: VolunteerRow): string | null {
  if (v.clocked_in_at && v.clocked_out_at) {
    const ms = new Date(v.clocked_out_at).getTime() - new Date(v.clocked_in_at).getTime()
    if (Number.isFinite(ms) && ms > 0) return formatHours(ms)
  }
  if (v.shift_start && v.shift_end) {
    const ms = new Date(v.shift_end).getTime() - new Date(v.shift_start).getTime()
    if (Number.isFinite(ms) && ms > 0) return formatHours(ms)
  }
  return null
}

export const sendVolunteerThankYouEmail = schemaTask({
  id: 'send-volunteer-thank-you',
  schema: z.object({
    eventId:    z.string().uuid(),
    eventTitle: z.string(),
    eventDate:  z.string(),
    orgName:    z.string(),
    orgEmail:   z.string().email().optional(),
  }),
  run: async (payload) => {
    const supabase = createAdminClient()

    const { data: volunteers, error } = await supabase
      .from('volunteers')
      .select('name, email, role, shift_start, shift_end, clocked_in_at, clocked_out_at')
      .eq('event_id', payload.eventId)
      .in('status', ['confirmed', 'checked_in'])

    if (error) {
      throw new Error(`Failed to load volunteers: ${error.message}`)
    }

    const rows = (volunteers ?? []) as VolunteerRow[]
    const recipients = rows.filter((v) => v.email && v.email.trim().length > 0)
    const total = recipients.length

    if (total === 0) {
      logger.info('No eligible volunteers to thank', { eventId: payload.eventId })
      return { sent: 0, failed: 0, total: 0 }
    }

    const fmtDate = (d: string) =>
      new Date(d).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })

    const eventUrl = `https://prezva.app/events/${payload.eventId}`
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set')
    }

    let sent = 0
    let failed = 0

    for (const v of recipients) {
      const name = v.name?.trim() || 'Volunteer'
      const role = v.role?.trim()
      const hours = hoursContributed(v)

      const hoursLineHtml = hours
        ? `<li>⏱️ <strong>Time contributed:</strong> ${escHtml(hours)}</li>`
        : ''
      const roleLineHtml = role ? `<li>🎯 <strong>Your role:</strong> ${escHtml(role)}</li>` : ''

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
            </div>
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">Thank you for volunteering</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p style="font-size:15px;">Hi ${escHtml(name)},</p>
            <p style="font-size:15px;">
              <strong style="color:#F0F4F8;">${escHtml(payload.eventTitle)}</strong> wouldn't have happened without people like you.
              On behalf of <strong style="color:#F0F4F8;">${escHtml(payload.orgName)}</strong>, thank you for giving your time on ${escHtml(fmtDate(payload.eventDate))}.
            </p>
            <ul style="padding-left:20px;line-height:1.8;font-size:15px;">
              ${roleLineHtml}
              ${hoursLineHtml}
            </ul>
            <p style="font-size:15px;">
              We hope you enjoyed being part of it. If you'd like to revisit the event, the page is still live:
            </p>
            <div style="margin:24px 0;">
              <a href="${escHtml(eventUrl)}"
                 style="background:#00BFA6;color:#0D1B2A;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                View Event Page
              </a>
            </div>
            <p style="color:#94A3B8;font-size:13px;">
              With gratitude,<br/>${escHtml(payload.orgName)}
            </p>
            <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
            <p style="color:#475569;font-size:12px;margin:0;">
              Questions or feedback? Just reply to this email.
            </p>
          </div>
        </div>
      `

      const textParts: string[] = [
        `Hi ${name},`,
        ``,
        `${payload.eventTitle} wouldn't have happened without people like you.`,
        `On behalf of ${payload.orgName}, thank you for giving your time on ${fmtDate(payload.eventDate)}.`,
        ``,
      ]
      if (role) textParts.push(`Your role: ${role}`)
      if (hours) textParts.push(`Time contributed: ${hours}`)
      if (role || hours) textParts.push(``)
      textParts.push(
        `We hope you enjoyed being part of it. If you'd like to revisit the event:`,
        eventUrl,
        ``,
        `With gratitude,`,
        payload.orgName,
        ``,
        `Questions or feedback? Just reply to this email.`,
      )
      const text = textParts.join('\n')

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from:     `${payload.orgName} <noreply@prezva.app>`,
            to:       v.email,
            subject:  `Thank you for volunteering at ${payload.eventTitle}`,
            html,
            text,
            reply_to: payload.orgEmail || undefined,
          }),
        })

        if (!res.ok) {
          const err = await res.text()
          failed += 1
          logger.error('Volunteer thank-you email failed', {
            email: v.email,
            status: res.status,
            err,
          })
          continue
        }

        sent += 1
      } catch (err) {
        failed += 1
        logger.error('Volunteer thank-you email threw', {
          email: v.email,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }

    logger.info('Volunteer thank-you batch complete', {
      eventId: payload.eventId,
      sent,
      failed,
      total,
    })

    return { sent, failed, total }
  },
})
