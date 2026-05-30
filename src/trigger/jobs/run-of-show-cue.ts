import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '../lib/supabase-admin'

export const rosCueNotificationTask = schedules.task({
  id: 'run-of-show-cue-notifications',
  cron: '* * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = new Date()
    const tenMinFromNow = new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    const elevenMinFromNow = new Date(now.getTime() + 11 * 60 * 1000).toISOString()

    const { data: items } = await admin
      .from('run_of_show_items')
      .select('id, title, time_at, responsible_email, responsible_person, event_id, events(title, timezone, organizations(name))')
      .eq('status', 'upcoming')
      .eq('cue_notification_sent', false)
      .gte('time_at', tenMinFromNow)
      .lte('time_at', elevenMinFromNow)

    if (!items?.length) return

    for (const item of items as any[]) {
      if (!item.responsible_email) {
        await admin.from('run_of_show_items')
          .update({ cue_notification_sent: true }).eq('id', item.id)
        continue
      }
      const orgName = item.events?.organizations?.name ?? 'Event organizer'
      const tz = item.events?.timezone ?? 'UTC'
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${orgName} <noreply@prezva.app>`,
          to: item.responsible_email,
          subject: `⏰ Your cue in 10 minutes: ${item.title}`,
          html: `<p>Hi ${item.responsible_person ?? 'there'},</p>
                 <p>Your cue <strong>${item.title}</strong> starts in approximately 10 minutes at ${new Date(item.time_at).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' })}.</p>
                 <p>— ${orgName}</p>`,
        }),
      }).catch(() => {})
      await admin.from('run_of_show_items')
        .update({ cue_notification_sent: true }).eq('id', item.id)
    }
  },
})
