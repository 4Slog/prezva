import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'

export const sendAnnouncement = schemaTask({
  id: 'send-announcement',
  schema: z.object({
    announcementId: z.string(),
  }),
  run: async (payload) => {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: ann } = await supabase
      .from('announcements')
      .select('id, event_id, title, body, channel, audience_filter, exclude_filter')
      .eq('id', payload.announcementId)
      .maybeSingle()

    if (!ann) return { sent: 0, failed: 0, reason: 'announcement not found' }
    if (ann.channel === 'push') return { sent: 0, failed: 0, reason: 'push-only — no email sent' }

    const audienceTypes: string[] = ann.audience_filter?.types ?? []
    const excludeTypes: string[] = ann.exclude_filter?.types ?? []

    const regQuery = supabase
      .from('registrations')
      .select('attendee_email, attendee_name, ticket_type_id')
      .eq('event_id', ann.event_id)
      .eq('status', 'confirmed')

    const { data: regsRaw } = await regQuery

    // Apply audience filter (include only specified ticket types, if any)
    let regs = regsRaw ?? []
    if (audienceTypes.length > 0) {
      regs = regs.filter((r: any) => audienceTypes.includes(r.ticket_type_id))
    }
    // Apply exclusion filter
    if (excludeTypes.length > 0) {
      regs = regs.filter((r: any) => !excludeTypes.includes(r.ticket_type_id))
    }

    if (regs.length === 0) return { sent: 0, failed: 0 }

    const { data: ev } = await supabase
      .from('events')
      .select('title')
      .eq('id', ann.event_id)
      .maybeSingle()

    const eventTitle = ev?.title ?? 'your event'

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0D1B2A;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="color:#00BFA6;margin:0;font-size:1.5rem;">${ann.title}</h1>
        </div>
        <div style="background:#112240;padding:24px;border-radius:0 0 12px 12px;color:#F0F4F8;">
          <p style="white-space:pre-line;">${ann.body}</p>
          <hr style="border:none;border-top:1px solid #1E3A5F;margin:16px 0;" />
          <p style="color:#94A3B8;font-size:0.875rem;">Powered by Prezva · ${eventTitle}</p>
        </div>
      </div>
    `

    let sent = 0
    let failed = 0

    for (const reg of regs) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Prezva <events@prezva.app>`,
          to: reg.attendee_email,
          subject: `📢 ${ann.title}`,
          html,
        }),
      })
      if (res.ok) sent++
      else failed++
    }

    return { sent, failed }
  },
})
