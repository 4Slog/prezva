import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '../lib/supabase-admin'
import { escapeHtml } from '../lib/escape'

export const speakerPostSessionTask = schedules.task({
  id: 'speaker-post-session-summary',
  cron: '*/10 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = new Date()
    const windowStart = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
    const windowEnd   = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()

    const { data: sessions } = await admin
      .from('sessions')
      .select('id, title, ends_at, event_id, events(title, slug, timezone, organizations(name))')
      .gte('ends_at', windowStart)
      .lte('ends_at', windowEnd)

    if (!sessions?.length) return

    for (const session of sessions as any[]) {
      const { data: assigned } = await admin
        .from('session_speakers')
        .select('speaker_id, post_session_email_sent_at, speakers(name, email, confirmation_token)')
        .eq('session_id', session.id)
        .is('post_session_email_sent_at', null)

      if (!assigned?.length) continue

      const { data: feedback } = await admin
        .from('session_feedback')
        .select('rating, comment')
        .eq('session_id', session.id)

      const ratings = ((feedback ?? []) as any[]).map(f => f.rating).filter(Boolean)
      const avg = ratings.length
        ? (ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length).toFixed(1)
        : null
      const comments = ((feedback ?? []) as any[])
        .filter(f => f.comment?.trim())
        .slice(0, 3)
        .map(f => f.comment.trim())

      const eventTitle = session.events?.title as string | undefined
      if (!eventTitle?.trim()) {
        throw new Error(`merge-tag: post-session eventTitle is empty (sessionId=${session.id})`)
      }
      const orgName = session.events?.organizations?.name as string | undefined
      if (!orgName?.trim()) {
        throw new Error(`merge-tag: post-session orgName is empty (sessionId=${session.id})`)
      }

      for (const row of assigned as any[]) {
        const speaker = row.speakers
        if (!speaker?.email) continue

        const hubUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/speaker/${speaker.confirmation_token}`

        const feedbackHtml = avg
          ? `<p>Your session received <strong>${ratings.length} rating${ratings.length !== 1 ? 's' : ''}</strong> with an average of <strong>${avg}/5 ⭐</strong>.</p>
             ${comments.length ? `<p><em>What attendees said:</em></p><ul>${comments.map((c: string) => `<li>"${escapeHtml(c)}"</li>`).join('')}</ul>` : ''}`
          : `<p>No ratings yet — check back in your speaker hub for feedback.</p>`

        const feedbackText = avg
          ? `Your session received ${ratings.length} rating${ratings.length !== 1 ? 's' : ''} with an average of ${avg}/5.\n\n${comments.length ? 'What attendees said:\n' + comments.map((c: string) => `"${c}"`).join('\n') : ''}`
          : 'No ratings yet — check back in your speaker hub for feedback.'

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${orgName} <noreply@prezva.app>`,
            to: speaker.email,
            subject: `Thank you for speaking at ${eventTitle}!`,
            text: [
              `Hi ${speaker.name},`,
              `Thank you for delivering "${session.title}" at ${eventTitle}. We hope it went well!`,
              feedbackText,
              `View full feedback in your speaker hub: ${hubUrl}`,
              `We hope to see you at a future event.`,
              `— ${orgName}`,
            ].filter(Boolean).join('\n\n'),
            html: `<p>Hi ${escapeHtml(speaker.name)},</p>
                   <p>Thank you for delivering <strong>${escapeHtml(session.title)}</strong> at ${escapeHtml(eventTitle)}. We hope it went well!</p>
                   ${feedbackHtml}
                   <p><a href="${hubUrl}">View full feedback in your speaker hub →</a></p>
                   <p>We hope to see you at a future event.</p>
                   <p>— ${escapeHtml(orgName)}</p>`,
          }),
        }).catch((err: unknown) => console.error('[post-session] email error:', err))

        await admin
          .from('session_speakers')
          .update({ post_session_email_sent_at: now.toISOString() })
          .eq('session_id', session.id)
          .eq('speaker_id', row.speaker_id)
      }
    }
  },
})
