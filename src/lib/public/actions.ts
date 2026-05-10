'use server'

import { createClient } from '@/lib/supabase/server'

export async function getPublicEvent(slug: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('slug', slug)
    .in('status', ['published', 'live', 'ended'])
    .single()
  if (error || !data) return null
  return data
}

export async function getPublicAgenda(eventId: string) {
  const supabase = await createClient()
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      *, 
      tracks(id, name, color), 
      rooms(id, name),
      session_speakers(speakers(id, name, job_title, company, photo_url))
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

export async function getBookmarks(userId: string, eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_bookmarks')
    .select('session_id, sessions!inner(event_id)')
    .eq('user_id', userId)
    .eq('sessions.event_id', eventId)
  return (data ?? []).map((b: { session_id: string }) => b.session_id)
}

export async function toggleBookmark(userId: string, eventId: string, sessionId: string) {
  const supabase = await createClient()
  void eventId
  const { data: existing } = await supabase
    .from('session_bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (existing) {
    await supabase.from('session_bookmarks').delete().eq('id', existing.id)
    return 'removed'
  }
  await supabase.from('session_bookmarks').insert({ user_id: userId, session_id: sessionId })
  return 'added'
}