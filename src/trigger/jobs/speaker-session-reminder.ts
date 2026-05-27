import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '../lib/supabase-admin'

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
      .select('id, title, starts_at, event_id, rooms(name), events(title, timezone, organizations(name))')
      .gte('starts_at', windowStart)
      .lte('starts_at', windowEnd)

    if (!sessions?.length) return

    for (const session of sessions as any[]) {
      const { data: assigned } = await admin
        .from('session_speakers')
        .select('speaker_id, reminder_sent_at, speakers(name, email, confirmation_token)')
        .eq('session_id', session.id)
        .is('reminder_sent_at', null)

      if (!assigned?.length) continue

      const eventTitle = session.events?.title ?? 'your event'
      const orgName = session.events?.organizations?.name ?? 'Event organizer'
      const tz = session.events?.timezone ?? 'UTC'
      const sessionTime = new Date(session.starts_at).toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', timeZone: tz,
      })
      const room = session.rooms?.name ? ` in ${session.rooms.name}` : ''

      for (const row of assigned as any[]) {
        const speaker = row.speakers
        if (!speaker?.email) continue

        const hubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/speaker/${speaker.confirmation_token}`

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${orgName} <noreply@prezva.app>`,
            to: speaker.email,
            subject: `Your session starts in ~15 minutes — ${session.title}`,
            html: `<p>Hi ${speaker.name},</p>
                   <p>Just a reminder: <strong>${session.title}</strong> begins at <strong>${sessionTime}${room}</strong>.</p>
                   <p>Head to your speaker hub for last-minute details:</p>
                   <p><a href="${hubUrl}">Open speaker hub →</a></p>
                   <p>— ${orgName}</p>`,
          }),
        }).catch((err: unknown) => console.error('[speaker-reminder] email error:', err))

        await admin
          .from('session_speakers')
          .update({ reminder_sent_at: now.toISOString() })
          .eq('session_id', session.id)
          .eq('speaker_id', row.speaker_id)
      }
    }
  },
})
