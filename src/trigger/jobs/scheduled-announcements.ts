import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'
import type { sendAnnouncement } from './announcement'

// Polls every 5 minutes for announcements due to send
export const scheduledAnnouncementsTask = schedules.task({
  id: 'scheduled-announcements-poll',
  cron: '*/5 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = new Date().toISOString()

    const { data: due } = await admin
      .from('announcements')
      .select('id, event_id, title, channel')
      .eq('status', 'scheduled')
      .lte('scheduled_for', now)
      .limit(50)

    if (!due?.length) return { processed: 0 }

    let enqueued = 0
    for (const announcement of due) {
      try {
        // Optimistic lock — only pick up if still 'scheduled'
        const { data: updated } = await admin
          .from('announcements')
          .update({ status: 'sending' })
          .eq('id', announcement.id)
          .eq('status', 'scheduled')
          .select('id')
          .maybeSingle()

        if (!updated) continue // another worker already picked it up

        if (announcement.channel === 'email' || announcement.channel === 'both') {
          await tasks.trigger<typeof sendAnnouncement>('send-announcement', {
            announcementId: announcement.id,
          })
        }

        await admin
          .from('announcements')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', announcement.id)

        enqueued++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[scheduled-announcements] Failed to enqueue ${announcement.id}:`, msg)
        await admin
          .from('announcements')
          .update({ status: 'failed' })
          .eq('id', announcement.id)
          .then(() => {}, () => {})
      }
    }

    return { processed: due.length, enqueued }
  },
})
