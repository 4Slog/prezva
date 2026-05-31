import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueAnnouncementDelivery } from '@/lib/trigger'

export async function createSystemAnnouncement(
  eventId: string,
  title: string,
  body: string,
): Promise<{ announcementId: string } | { error: string }> {
  const admin = createAdminClient()
  const { count } = await admin
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
  const { data, error } = await admin
    .from('announcements')
    .insert({
      event_id: eventId,
      created_by: '00000000-0000-0000-0000-000000000000',
      title,
      body,
      channel: 'email',
      segment: null,
      audience_filter: { types: [], tags: [] },
      exclude_filter: { types: [], tags: [] },
      scheduled_for: null,
      sent_at: null,
      recipient_count: count ?? 0,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }
  await enqueueAnnouncementDelivery({ announcementId: data.id })
  return { announcementId: data.id }
}
