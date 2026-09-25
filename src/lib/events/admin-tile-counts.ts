import { createAdminClient } from '@/lib/supabase/admin'

export interface TileBadge {
  key: string
  label: string
  variant?: 'warning' | 'info' | 'error'
}

export async function getAdminTileBadges(eventId: string): Promise<Record<string, TileBadge>> {
  // Admin client: parallel count queries across event modules
  const admin = createAdminClient()

  // O145: every count reads a real table and column (the old event_speakers,
  // networking_profiles, surveys.is_published and community_posts.reported_at
  // never existed, so these tiles always showed nothing).
  const [
    speakersRes,
    surveysRes,
    networkingRes,
    communityRes,
  ] = await Promise.allSettled([
    // "Pending" speakers are the ones invited and not yet answered.
    admin.from('speakers').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'invited'),
    admin.from('surveys').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'active'),
    // Attendees visible in the networking directory (event_visible_profiles).
    admin.from('attendee_profiles').select('id', { count: 'exact', head: true }).eq('event_id', eventId).eq('is_visible', true),
    // Unresolved reports on this event's posts — the same set the moderation
    // queue (getCommunityReports) shows.
    admin.from('community_reports').select('id, community_posts!inner(event_id)', { count: 'exact', head: true })
      .eq('community_posts.event_id', eventId).is('resolved_at', null),
  ])

  const badges: Record<string, TileBadge> = {}
  // A failed count shows no badge, but it is logged rather than read as zero.
  const countOf = (res: PromiseSettledResult<{ count: number | null; error: { message: string } | null }>, tile: string) => {
    const error = res.status === 'rejected' ? String(res.reason) : res.value.error?.message
    if (error) console.error(`[admin-tiles] ${tile} count failed: ${error}`)
    return res.status === 'fulfilled' ? (res.value.count ?? 0) : 0
  }

  const speakerPending = countOf(speakersRes, 'speakers')
  if (speakerPending > 0) {
    badges['speakers'] = { key: 'speakers', label: `${speakerPending} pending`, variant: 'warning' }
  }

  const activeSurveys = countOf(surveysRes, 'surveys')
  if (activeSurveys > 0) {
    badges['surveys'] = { key: 'surveys', label: `${activeSurveys} active` }
  }

  const networkingOptIns = countOf(networkingRes, 'networking')
  if (networkingOptIns > 0) {
    badges['networking'] = { key: 'networking', label: `${networkingOptIns} opted in`, variant: 'info' }
  }

  const reportedPosts = countOf(communityRes, 'community')
  if (reportedPosts > 0) {
    badges['community'] = { key: 'community', label: `${reportedPosts} reported`, variant: 'error' }
  }

  return badges
}
