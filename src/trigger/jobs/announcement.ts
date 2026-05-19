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

    const { data: ev } = await supabase
      .from('events')
      .select('title, slug, organizations(name, email)')
      .eq('id', ann.event_id)
      .maybeSingle()

    const eventTitle = (ev as any)?.title ?? 'your event'
    const eventSlug  = (ev as any)?.slug ?? ''
    const orgInfo    = (ev as any)?.organizations as { name: string; email?: string } | null
    const orgName    = orgInfo?.name ?? 'Your organizer'
    const orgEmail   = orgInfo?.email || undefined
    const eventUrl   = eventSlug ? `https://prezva.app/e/${eventSlug}` : ''

    const regQuery = supabase
      .from('registrations')
      .select('id, attendee_email, attendee_name, ticket_type_id, user_id')
      .eq('event_id', ann.event_id)
      .eq('status', 'confirmed')

    const { data: regsRaw } = await regQuery

    let regs = regsRaw ?? []
    if (audienceTypes.length > 0) {
      regs = regs.filter((r: any) => audienceTypes.includes(r.ticket_type_id))
    }
    if (excludeTypes.length > 0) {
      regs = regs.filter((r: any) => !excludeTypes.includes(r.ticket_type_id))
    }

    if (regs.length === 0) return { sent: 0, failed: 0 }

    // Fetch opt-out prefs for all users who have them
    const userIds = regs.map((r: any) => r.user_id).filter(Boolean)
    const prefMap: Record<string, boolean> = {}
    if (userIds.length > 0) {
      const { data: prefs } = await supabase
        .from('attendee_preferences')
        .select('user_id, email_announcements')
        .in('user_id', userIds)
      for (const p of prefs ?? []) {
        prefMap[(p as any).user_id] = (p as any).email_announcements
      }
    }

    let sent = 0
    let failed = 0

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

    for (const reg of regs) {
      // Default opt-in; skip only if user explicitly set email_announcements = false
      if ((reg as any).user_id && prefMap[(reg as any).user_id] === false) continue

      const regIdB64 = Buffer.from((reg as any).id).toString('base64url')
      const unsubUrl = `${appUrl}/api/unsubscribe?token=${regIdB64}&type=announcements`
      const unsubAllUrl = `${appUrl}/api/unsubscribe?token=${regIdB64}&type=all`

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
            </div>
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">${ann.title}</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p style="font-size:15px;">Hi ${reg.attendee_name.trim().split(/\s+/)[0]},</p>
            <p style="white-space:pre-line;font-size:15px;line-height:1.6;">${ann.body}</p>
            ${eventUrl ? `<p style="margin:16px 0;"><a href="${eventUrl}" style="color:#00BFA6;text-decoration:none;font-size:14px;">→ View event page</a></p>` : ''}
            <hr style="border:none;border-top:1px solid #1E3A5F;margin:20px 0;" />
            <p style="color:#475569;font-size:12px;margin:0;">
              Sent by ${orgName} via <a href="https://prezva.app" style="color:#00BFA6;text-decoration:none;">Prezva</a> · ${eventTitle}<br/>
              You received this because you are registered for this event.
            </p>
            <p style="font-size:11px;color:#475569;text-align:center;margin-top:16px;">
              <a href="${unsubUrl}" style="color:#64748B;">Unsubscribe from announcements</a> ·
              <a href="${unsubAllUrl}" style="color:#64748B;">Unsubscribe from all emails</a>
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
          from:     `${orgName} <noreply@prezva.app>`,
          to:       reg.attendee_email,
          subject:  `${orgName}: ${ann.title}`,
          html,
          reply_to: orgEmail,
          headers:  { 'List-Unsubscribe': `<${unsubAllUrl}>` },
        }),
      })
      if (res.ok) {
        sent++
        // Create in-app notification for users who have an account
        if ((reg as any).user_id) {
          await supabase.from('user_notifications').insert({
            user_id: (reg as any).user_id,
            type: 'announcement',
            title: ann.title,
            body: ann.body ? ann.body.slice(0, 120) : undefined,
            url: eventUrl || undefined,
          }).then(() => {})
        }
      } else {
        failed++
      }
    }

    // Update announcement status based on delivery outcome
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    if (sent > 0) {
      await admin
        .from('announcements')
        .update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: sent })
        .eq('id', payload.announcementId)
    } else if (failed > 0 && sent === 0) {
      await admin
        .from('announcements')
        .update({ status: 'failed' })
        .eq('id', payload.announcementId)
    }

    return { sent, failed }
  },
})
