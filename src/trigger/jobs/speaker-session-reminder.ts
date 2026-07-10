import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '../lib/supabase-admin'
import { escapeHtml } from '../lib/escape'
import { sendSpeakerEmail } from '@/lib/speaker/send-speaker-email'

export const speakerSessionReminderTask = schedules.task({
  id: 'speaker-session-reminder',
  cron: '*/5 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = new Date()
    const windowStart = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    const windowEnd   = new Date(now.getTime() + 20 * 60 * 1000).toISOString()

    const { data: sessions } = await admin
      .from('sessions')
      .select('id, title, starts_at, event_id, rooms(name), events(title, timezone, org_id, organizations(name))')
      .gte('starts_at', windowStart)
      .lte('starts_at', windowEnd)

    if (!sessions?.length) return

    for (const session of sessions as any[]) {
      const { data: assigned } = await admin
        .from('session_speakers')
        .select('speaker_id, reminder_sent_at, speakers(name, email, confirmation_token, ghl_contact_id)')
        .eq('session_id', session.id)
        .is('reminder_sent_at', null)

      if (!assigned?.length) continue

      const eventTitle = session.events?.title ?? 'your event'
      const orgName = session.events?.organizations?.name as string | undefined
      if (!orgName?.trim()) {
        throw new Error(`merge-tag: session-reminder orgName is empty (sessionId=${session.id})`)
      }
      const tz = session.events?.timezone ?? 'UTC'
      const sessionTime = new Date(session.starts_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: tz,
      })
      const roomName = session.rooms?.name as string | undefined
      const room = roomName ? ` in ${roomName}` : ''
      const roomHtml = roomName ? ` in ${escapeHtml(roomName)}` : ''

      for (const row of assigned as any[]) {
        const speaker = row.speakers
        if (!speaker?.email) continue

        const hubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/speaker/${speaker.confirmation_token}`

        const text = [
          `Hi ${speaker.name},`,
          `Just a reminder: "${session.title}" begins at ${sessionTime}${room}.`,
          `Head to your speaker hub for last-minute details: ${hubUrl}`,
          `— ${orgName}`,
        ].join('\n\n')
        const html = `<p>Hi ${escapeHtml(speaker.name)},</p>
                   <p>Just a reminder: <strong>${escapeHtml(session.title)}</strong> begins at <strong>${sessionTime}${roomHtml}</strong>.</p>
                   <p>Head to your speaker hub for last-minute details:</p>
                   <p><a href="${hubUrl}">Open speaker hub →</a></p>
                   <p>— ${escapeHtml(orgName)}</p>`

        try {
          await sendSpeakerEmail({
            admin,
            orgId: session.events?.org_id,
            speaker: {
              id: row.speaker_id,
              name: speaker.name,
              email: speaker.email,
              ghlContactId: speaker.ghl_contact_id,
            },
            subject: `Your session starts in ~15 minutes — ${session.title}`,
            html,
            text,
            resend: { from: `${orgName} <noreply@prezva.app>` },
          })

          await admin
            .from('session_speakers')
            .update({ reminder_sent_at: now.toISOString() })
            .eq('session_id', session.id)
            .eq('speaker_id', row.speaker_id)
        } catch (err) {
          console.error('[speaker-reminder] send failed, will retry:', err)
          continue
        }
      }
    }
  },
})
