import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EVENT_COLUMNS, SESSION_COLUMNS } from '@/lib/db/public-columns'

export async function getPublicEvent(slug: string) {
  const supabase = await createClient()

  // First try public (published) event
  const { data: publicEvent } = await supabase
    .from('events')
    .select(`${EVENT_COLUMNS}, organizations(name, logo_url, website, slug)`)
    .eq('slug', slug)
    .in('status', ['published', 'live', 'ended'])
    .single()
  if (publicEvent) return publicEvent

  // Allow org members to preview draft/cancelled events
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: draftEvent } = await supabase
    .from('events')
    .select(`${EVENT_COLUMNS}, organizations(name, logo_url, website, slug)`)
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
      ${SESSION_COLUMNS},
      tracks(id, name, color),
      rooms(id, name),
      session_speakers(role, speakers(id, name, job_title, company, photo_url)),
      sponsored_by:event_sponsors(id, name, logo_url, website_url)
    `)
    .eq('event_id', eventId)
    .eq('is_published', true)
    .order('starts_at', { ascending: true })
  // Untyped rows, as before: the '*' select this replaced was never inferred,
  // and the embeds come back as objects at runtime, not the arrays the parser
  // would claim.
  return (sessions ?? []) as any[]
}

// R91 / E-R3: speakers.email is service-only (0158). The public speaker pages
// (and only they — never agenda or session views) show it for published
// speakers who switched show_email_publicly on. Rows still come from RLS; the
// emails are merged into exactly those rows.
async function publicSpeakerEmails(eventId: string, speakerIds?: string[]): Promise<Map<string, string>> {
  if (speakerIds && speakerIds.length === 0) return new Map()
  let q = createAdminClient()
    .from('speakers')
    .select('id, email')
    .eq('event_id', eventId)
    .eq('is_published', true)
    .eq('show_email_publicly', true)
  if (speakerIds) q = q.in('id', speakerIds)
  const { data, error } = await q
  if (error) {
    console.error('[public speakers] email read failed', error.message)
    return new Map()
  }
  return new Map((data ?? []).filter(r => r.email).map(r => [r.id, r.email as string]))
}

export async function getPublicSpeakers(eventId: string, opts: { withOptedInEmail?: boolean } = {}) {
  const supabase = await createClient()
  const rowsQuery = supabase
    .from('speakers')
    .select('id, event_id, name, bio, photo_url, job_title, company, website, linkedin_url, twitter_handle, sort_order, is_published, event_role')
    .eq('event_id', eventId)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })
  if (!opts.withOptedInEmail) return (await rowsQuery).data ?? []
  // Both reads at once; emails are kept only for the ids RLS returned.
  const [{ data }, emails] = await Promise.all([rowsQuery, publicSpeakerEmails(eventId)])
  return (data ?? []).map(r => ({ ...r, email: emails.get(r.id) ?? null }))
}

export async function getPublicSpeaker(eventId: string, speakerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('speakers')
    .select(`
      id, event_id, name, bio, photo_url, job_title, company, website, linkedin_url, twitter_handle, sort_order, is_published, event_role,
      session_speakers(sessions(id, title, starts_at, ends_at, session_type, is_published))
    `)
    .eq('event_id', eventId)
    .eq('id', speakerId)
    .single()
  if (!data) return data
  const emails = await publicSpeakerEmails(eventId, [data.id])
  return { ...data, email: emails.get(data.id) ?? null }
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

export async function getPublicSession(eventId: string, sessionId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sessions')
    .select(`
      ${SESSION_COLUMNS},
      tracks(id, name, color),
      rooms(id, name),
      session_speakers(role, speakers(id, name, job_title, company, photo_url)),
      sponsored_by:event_sponsors(id, name, logo_url, website_url)
    `)
    .eq('event_id', eventId)
    .eq('id', sessionId)
    .eq('is_published', true)
    .maybeSingle()
  return data as any
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

