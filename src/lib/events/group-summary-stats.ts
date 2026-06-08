import { createAdminClient } from '@/lib/supabase/admin'

export interface GroupSummaryStats {
  sessions: number
  communityPosts: number
  announcementsSent: number
  sponsors: number
  failedJobs: number
}

export async function getGroupSummaryStats(eventId: string): Promise<GroupSummaryStats> {
  const admin = createAdminClient()
  const [sessionsRes, communityRes, announcementsRes, sponsorsRes, deadLettersRes] = await Promise.all([
    admin.from('sessions').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    admin.from('community_posts').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    admin.from('announcements').select('id', { count: 'exact', head: true }).eq('event_id', eventId).not('sent_at', 'is', null),
    admin.from('event_sponsors').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    admin.from('dead_letter_items').select('id', { count: 'exact', head: true }).eq('event_id', eventId).is('resolved_at', null),
  ])
  return {
    sessions:          sessionsRes.count      ?? 0,
    communityPosts:    communityRes.count     ?? 0,
    announcementsSent: announcementsRes.count ?? 0,
    sponsors:          sponsorsRes.count      ?? 0,
    failedJobs:        deadLettersRes.count   ?? 0,
  }
}
