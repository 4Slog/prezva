import { createClient } from '@/lib/supabase/server'

export async function getPublicEvent(slug: string) {
  const supabase = await createClient()

  // First try public (published) event
  const { data: publicEvent } = await supabase
    .from('events')
    .select('*, organizations(name, logo_url, website)')
    .eq('slug', slug)
    .in('status', ['published', 'live', 'ended'])
    .single()
  if (publicEvent) return publicEvent

  // Allow org members to preview draft/cancelled events
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: draftEvent } = await supabase
    .from('events')
    .select('*, organizations(name, logo_url, website)')
    .eq('slug', slug)
    .single()
  if (!draftEvent) return null

  // Verify user is a member of the org that owns this event
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (draftEvent as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return null

  return { ...draftEvent, _isDraftPreview: true }
}

export async function getPublicAgenda(eventId: string) {
  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      *,
      tracks(id, name, color),
      rooms(id, name),
      session_speakers(role, speakers(id, name, job_title, company, photo_url)),
      sponsored_by:event_sponsors(id, name, logo_url, website_url)
    `)
    .eq('event_id', eventId)
    .eq('is_published', true)
    .order('starts_at', { ascending: true })
  return sessions ?? []
}

export async function getPublicSpeakers(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('speakers')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
  return data ?? []
}

export async function getPublicSpeaker(eventId: string, speakerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('speakers')
    .select(`
      *,
      session_speakers(sessions(id, title, starts_at, ends_at, session_type, is_published))
    `)
    .eq('event_id', eventId)
    .eq('id', speakerId)
    .single()
  return data
}

export async function getPublicSponsors(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_sponsors')
    .select('id, name, website_url, logo_url, tier, sort_order, is_featured')
    .eq('event_id', eventId)
    .order('tier')
    .order('sort_order')
  return data ?? []
}

export async function getPublicTicketTypes(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ticket_types')
    .select('type, price_cents')
    .eq('event_id', eventId)
  return data ?? []
}

export async function getBookmarks(userId: string, eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_bookmarks')
    .select('session_id, sessions!inner(event_id)')
    .eq('user_id', userId)
    .eq('sessions.event_id', eventId)
  return (data ?? []).map((b: { session_id: string }) => b.session_id)
}

