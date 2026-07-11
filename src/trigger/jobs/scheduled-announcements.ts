import { schedules, tasks } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase-admin'
import { sendAnnouncementPush } from '@/lib/push/send'
import type { sendAnnouncement } from './announcement'

const CLAIM_STALE_MS = 10 * 60 * 1000

export async function runScheduledAnnouncementsPoll(
  admin: SupabaseClient,
): Promise<{ processed: number; enqueued: number }> {
  const now = new Date().toISOString()
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()

  // Due-scheduled rows plus 'sending' rows abandoned by a run that died
  // mid-flight (stale > 10min, per announcements.updated_at).
  const { data: due } = await admin
    .from('announcements')
    .select('id, event_id, title, body, channel')
    .or(`and(status.eq.scheduled,scheduled_for.lte.${now}),and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .limit(50)

  if (!due?.length) return { processed: 0, enqueued: 0 }

  let enqueued = 0
  for (const row of due) {
    if (row.channel === 'push') {
      // Push-only: the poller is the sole owner — claim, send, and
      // terminalize inline. Never fall through with a claimed row left
      // 'sending'.
      const { data: claimed } = await admin
        .from('announcements')
        .update({ status: 'sending' })
        .eq('id', row.id)
        .or(`status.in.(scheduled,draft),and(status.eq.sending,updated_at.lt.${staleBefore})`)
        .select('id')
        .maybeSingle()

      if (!claimed) continue // owned by another run or terminal

      try {
        await sendAnnouncementPush(row.event_id, row.title, row.body)
        await admin
          .from('announcements')
          .update({ status: 'sent', sent_at: new Date().toISOString(), recipient_count: 0 })
          .eq('id', row.id)
        enqueued++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[scheduled-announcements] push-only send failed for ${row.id}:`, msg)
        await admin
          .from('announcements')
          .update({ status: 'failed' })
          .eq('id', row.id)
      }
      continue
    }

    // channel === 'email' || channel === 'both' — do NOT claim or fire push
    // here. The delivery task claims the row and owns terminal state (and,
    // for 'both', push) via idempotent trigger.
    try {
      await tasks.trigger<typeof sendAnnouncement>(
        'send-announcement',
        { announcementId: row.id },
        { idempotencyKey: row.id, idempotencyKeyTTL: '10m' },
      )
      enqueued++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[scheduled-announcements] failed to trigger delivery for ${row.id}:`, msg)
    }
  }

  return { processed: due.length, enqueued }
}

// Polls every 5 minutes for announcements due to send
export const scheduledAnnouncementsTask = schedules.task({
  id: 'scheduled-announcements-poll',
  cron: '*/5 * * * *',
  run: async () => runScheduledAnnouncementsPoll(createAdminClient()),
})
