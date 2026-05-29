import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'

export const sendAnnouncement = schemaTask({
  id: 'send-announcement',
  schema: z.object({
    announcementId: z.string(),
  }),
  run: async (payload) => {
    const supabase = createAdminClient()

    const { data: ann } = await supabase
      .from('announcements')
      .select('id, event_id, title, body, channel, audience_filter, exclude_filter, status')
      .eq('id', payload.announcementId)
      .maybeSingle()

    if (!ann) return { sent: 0, failed: 0, reason: 'announcement not found' }
    if (ann.status === 'sent' || ann.status === 'sending') {
      return { sent: 0, failed: 0, reason: `already ${ann.status} — duplicate trigger ignored` }
    }
    if (ann.channel === 'push') return { sent: 0, failed: 0, reason: 'push-only — no email sent' }

    const audienceTypes: string[] = ann.audience_filter?.types ?? []
    const excludeTypes: string[] = ann.exclude_filter?.types ?? []

    const { data: ev } = await supabase
      .from('events')
      .select('title, slug, organizations(name, email)')
      .eq('id', ann.event_id)
      .maybeSingle()

    const eventTitle = (ev as any)?.title as string | undefined
    if (!eventTitle?.trim()) {
      throw new Error(`merge-tag: announcement eventTitle is empty (announcementId=${payload.announcementId}, eventId=${ann.event_id})`)
    }
    const eventSlug  = (ev as any)?.slug ?? ''
    const orgInfo    = (ev as any)?.organizations as { name: string; email?: string } | null
    if (!orgInfo?.name?.trim()) {
      throw new Error(`merge-tag: announcement orgName is empty (announcementId=${payload.announcementId}, eventId=${ann.event_id})`)
    }
    const orgName    = orgInfo.name
    const orgEmail   = orgInfo.email || undefined
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

    // Apply opt-out filter before chunking. Default opt-in; skip only if user explicitly opted out.
    const eligibleRegs = regs.filter(
      (reg: any) => !(reg.user_id && prefMap[reg.user_id] === false),
    )

    // Skip addresses that hard-bounced or filed spam complaints — protects domain reputation.
    const { data: suppressions } = await supabase
      .from('email_suppressions')
      .select('email')
    const suppressedSet = new Set(
      (suppressions ?? []).map((s: any) => (s.email as string).toLowerCase()),
    )
    const finalRegs = eligibleRegs.filter(
      (reg: any) => !suppressedSet.has(reg.attendee_email.toLowerCase()),
    )

    if (finalRegs.length === 0) return { sent: 0, failed: 0 }

    const buildEmailPayload = (reg: any) => {
      const regIdB64 = Buffer.from(reg.id).toString('base64url')
      const unsubUrl = `${appUrl}/api/unsubscribe?token=${regIdB64}&type=announcements`
      const unsubAllUrl = `${appUrl}/api/unsubscribe?token=${regIdB64}&type=all`
      const firstName = reg.attendee_name.trim().split(/\s+/)[0]

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#0D1B2A;padding:24px 32px;border-radius:12px 12px 0 0;">
            <div style="background:#00BFA6;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="color:#0D1B2A;font-weight:900;font-size:18px;">P</span>
            </div>
            <h1 style="color:#F0F4F8;font-size:20px;margin:0;">${ann.title}</h1>
          </div>
          <div style="background:#0F2236;padding:24px 32px;border-radius:0 0 12px 12px;color:#CBD5E1;">
            <p style="font-size:15px;">Hi ${firstName},</p>
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
            <p style="font-size:11px;color:#475569;text-align:center;margin-top:8px;">
              4S Logistics LLC · 300 Colonial Center Pkwy, Ste 100N, Roswell, GA 30076, USA
            </p>
          </div>
        </div>
      `

      const text = [
        `Hi ${firstName},`,
        ``,
        ann.body,
        ``,
        eventUrl ? `Event page: ${eventUrl}` : '',
        ``,
        `Sent by ${orgName} via Prezva — ${eventTitle}.`,
        `You received this because you are registered for this event.`,
        ``,
        `Unsubscribe from announcements: ${unsubUrl}`,
        `Unsubscribe from all emails: ${unsubAllUrl}`,
        `4S Logistics LLC · 300 Colonial Center Pkwy, Ste 100N, Roswell, GA 30076, USA`,
      ].filter(Boolean).join('\n')

      return {
        from:     `${orgName} <noreply@prezva.app>`,
        to:       reg.attendee_email,
        subject:  `${orgName}: ${ann.title}`,
        html,
        text,
        reply_to: orgEmail,
        headers:  { 'List-Unsubscribe': `<${unsubAllUrl}>` },
      }
    }

    const CHUNK_SIZE = 100
    const chunks: any[][] = []
    for (let i = 0; i < finalRegs.length; i += CHUNK_SIZE) {
      chunks.push(finalRegs.slice(i, i + CHUNK_SIZE))
    }

    const deliveredUserIds: string[] = []

    for (const chunk of chunks) {
      const emails = chunk.map(buildEmailPayload)
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emails),
      })
      if (res.ok) {
        sent += chunk.length
        for (const reg of chunk) {
          if ((reg as any).user_id) deliveredUserIds.push((reg as any).user_id)
        }
      } else {
        const err = await res.text()
        console.error(`[announcement] batch failed (${chunk.length} recipients): ${err}`)
        failed += chunk.length
      }
    }

    // Single bulk insert for in-app notifications — only for successfully sent recipients.
    if (deliveredUserIds.length > 0) {
      const notifRows = deliveredUserIds.map((user_id) => ({
        user_id,
        type: 'announcement' as const,
        title: ann.title,
        body: ann.body ? ann.body.slice(0, 120) : undefined,
        url: eventUrl || undefined,
      }))
      await supabase.from('user_notifications').insert(notifRows)
    }

    // Update announcement status based on delivery outcome
    const admin = createAdminClient()
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
