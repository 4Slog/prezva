import { createAdminClient } from '@/lib/supabase/admin'

export interface TileBadge {
  key: string
  label: string
  variant?: 'warning' | 'info' | 'error'
}

export async function getAdminTileBadges(eventId: string): Promise<Record<string, TileBadge>> {
  // Admin client: parallel count queries across event modules
  const admin = createAdminClient()

  const [
    speakersRes,
    surveysRes,
    networkingRes,
    communityRes,
    certsRes,
  ] = await Promise.allSettled([
    admin.from('event_speakers').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'pending'),
    admin.from('surveys').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('is_published', true),
    admin.from('networking_profiles').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('opt_in', true),
    admin.from('community_posts').select('*', { count: 'exact', head: true }).eq('event_id', eventId).not('reported_at', 'is', null),
    admin.from('registrations').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('status', 'confirmed').is('issued_certificates.id', null),
  ])

  const badges: Record<string, TileBadge> = {}

  const speakerPending = speakersRes.status === 'fulfilled' ? (speakersRes.value.count ?? 0) : 0
  if (speakerPending > 0) {
    badges['speakers'] = { key: 'speakers', label: `${speakerPending} pending`, variant: 'warning' }
  }

  const activeSurveys = surveysRes.status === 'fulfilled' ? (surveysRes.value.count ?? 0) : 0
  if (activeSurveys > 0) {
    badges['surveys'] = { key: 'surveys', label: `${activeSurveys} active` }
  }

  const networkingOptIns = networkingRes.status === 'fulfilled' ? (networkingRes.value.count ?? 0) : 0
  if (networkingOptIns > 0) {
    badges['networking'] = { key: 'networking', label: `${networkingOptIns} opted in`, variant: 'info' }
  }

  const reportedPosts = communityRes.status === 'fulfilled' ? (communityRes.value.count ?? 0) : 0
  if (reportedPosts > 0) {
    badges['community'] = { key: 'community', label: `${reportedPosts} reported`, variant: 'error' }
  }

  return badges
}
