'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'

// ── T-059: Session tags ───────────────────────────────────────────────────────

export async function updateSessionTags(sessionId: string, tags: string[]) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('sessions')
    .update({ tags, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ── T-060+061: Session capacity + conflict check ──────────────────────────────

export async function checkSessionConflicts(eventId: string, params: {
  sessionId?: string
  roomId?: string | null
  speakerIds?: string[]
  startsAt: string
  endsAt: string
}) {
  const supabase = await createClient()

  const conflicts: Array<{ type: string; title: string }> = []

  let baseQuery = supabase
    .from('sessions')
    .select('id, title, starts_at, ends_at')
    .eq('event_id', eventId)
    .lt('starts_at', params.endsAt)
    .gt('ends_at', params.startsAt)

  if (params.sessionId) {
    baseQuery = baseQuery.neq('id', params.sessionId)
  }

  if (params.roomId) {
    const { data: roomConflicts } = await baseQuery.eq('room_id', params.roomId)
    for (const s of roomConflicts ?? []) {
      conflicts.push({ type: 'room', title: s.title })
    }
  }

  if (params.speakerIds && params.speakerIds.length > 0) {
    const { data: speakerSessions } = await supabase
      .from('session_speakers')
      .select('session_id, sessions!inner(id, title, starts_at, ends_at, event_id)')
      .in('speaker_id', params.speakerIds)

    for (const ss of speakerSessions ?? []) {
      const s = (ss as any).sessions
      if (!s || s.event_id !== eventId) continue
      if (params.sessionId && s.id === params.sessionId) continue
      const overlap = s.starts_at < params.endsAt && s.ends_at > params.startsAt
      if (overlap) conflicts.push({ type: 'speaker', title: s.title })
    }
  }

  return conflicts
}

export async function getSessionCapacityUsed(sessionId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('session_bookmarks')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  return count ?? 0
}

// ── T-062+063: Bulk session operations ───────────────────────────────────────

export async function bulkShiftSessions(sessionIds: string[], shiftMinutes: number) {
  await requireUser()
  const supabase = await createClient()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, starts_at, ends_at')
    .in('id', sessionIds)

  if (!sessions) return { error: 'Sessions not found' }

  for (const s of sessions) {
    const newStart = new Date(new Date(s.starts_at).getTime() + shiftMinutes * 60000).toISOString()
    const newEnd = new Date(new Date(s.ends_at).getTime() + shiftMinutes * 60000).toISOString()
    await supabase.from('sessions').update({ starts_at: newStart, ends_at: newEnd }).eq('id', s.id)
  }

  revalidatePath('/events')
  return { success: true, count: sessions.length }
}

export async function bulkAssignSessions(
  sessionIds: string[],
  updates: { track_id?: string | null; room_id?: string | null; tags?: string[] },
) {
  await requireUser()
  const supabase = await createClient()

  const patch: Record<string, unknown> = {}
  if ('track_id' in updates) patch.track_id = updates.track_id
  if ('room_id' in updates) patch.room_id = updates.room_id
  if (updates.tags !== undefined) patch.tags = updates.tags
  patch.updated_at = new Date().toISOString()

  const { error } = await supabase.from('sessions').update(patch).in('id', sessionIds)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ── T-065: Session visibility scheduling ─────────────────────────────────────

export async function updateSessionVisibility(
  sessionId: string,
  visibleFrom: string | null,
  visibleUntil: string | null,
) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('sessions')
    .update({ visible_from: visibleFrom, visible_until: visibleUntil, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ── T-071: Bulk sort order (DnD reorder) ─────────────────────────────────────

export async function updateSessionSortOrders(orderedIds: string[]) {
  await requireUser()
  const supabase = await createClient()

  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase.from('sessions').update({ sort_order: idx }).eq('id', id),
    ),
  )

  revalidatePath('/events')
  return { success: true }
}

// ── T-067: Session documents ─────────────────────────────────────────────────

export async function getSessionDocuments(sessionId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_documents')
    .select('*')
    .eq('session_id', sessionId)
    .order('sort_order', { ascending: true })
  return data ?? []
}

export async function deleteSessionDocument(documentId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('session_documents').delete().eq('id', documentId)
  revalidatePath('/events')
}

export async function createSessionDocument(sessionId: string, eventId: string, doc: {
  name: string
  storage_path: string
  file_size_bytes?: number
  mime_type?: string
  is_public?: boolean
}) {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('session_documents').insert({
    session_id: sessionId,
    event_id: eventId,
    uploaded_by: user.id,
    ...doc,
  })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ── T-068: Event document folders ────────────────────────────────────────────

export async function getEventFolders(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_folders')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  return data ?? []
}

export async function createEventFolder(eventId: string, name: string) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('event_folders').insert({ event_id: eventId, name })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteEventFolder(folderId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('event_folders').delete().eq('id', folderId)
  revalidatePath('/events')
}

export async function getEventDocuments(eventId: string, query?: string, folderId?: string) {
  const supabase = await createClient()
  let q = supabase
    .from('event_documents')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (folderId) q = q.eq('folder_id', folderId)
  if (query) q = q.textSearch('fts', query, { type: 'plain' })

  const { data } = await q
  return data ?? []
}

export async function createEventDocument(eventId: string, doc: {
  name: string
  storage_path: string
  folder_id?: string | null
  file_size_bytes?: number
  mime_type?: string
  is_public?: boolean
}) {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('event_documents').insert({
    event_id: eventId,
    uploaded_by: user.id,
    ...doc,
  })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteEventDocument(documentId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('event_documents').delete().eq('id', documentId)
  revalidatePath('/events')
}

// ── T-069: Venue maps ────────────────────────────────────────────────────────

export async function getVenueMaps(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('venue_maps')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  return data ?? []
}

export async function createVenueMap(eventId: string, map: {
  name: string
  storage_path: string
  hotspots?: Array<{ id: string; label: string; x_pct: number; y_pct: number; w_pct: number; h_pct: number }>
}) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('venue_maps').insert({
    event_id: eventId,
    name: map.name,
    storage_path: map.storage_path,
    hotspots: map.hotspots ?? [],
  })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function updateVenueMapHotspots(mapId: string, hotspots: unknown[]) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('venue_maps').update({ hotspots }).eq('id', mapId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteVenueMap(mapId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('venue_maps').delete().eq('id', mapId)
  revalidatePath('/events')
}

// ── T-070: Waivers ───────────────────────────────────────────────────────────

export async function getEventWaivers(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_waivers')
    .select('*')
    .eq('event_id', eventId)
  return data ?? []
}

export async function createEventWaiver(eventId: string, waiver: {
  title: string
  body: string
  is_required?: boolean
}) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('event_waivers').insert({ event_id: eventId, ...waiver })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteEventWaiver(waiverId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('event_waivers').delete().eq('id', waiverId)
  revalidatePath('/events')
}

export async function signWaiver(waiverId: string, registrationId?: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('waiver_signatures').upsert(
    { waiver_id: waiverId, user_id: user.id, registration_id: registrationId ?? null },
    { onConflict: 'waiver_id,user_id' },
  )
  if (error) return { error: error.message }
  return { success: true }
}

export async function getUserWaiverStatus(eventId: string, userId: string) {
  const supabase = await createClient()

  const { data: waivers } = await supabase
    .from('event_waivers')
    .select('id, title, is_required')
    .eq('event_id', eventId)

  if (!waivers || waivers.length === 0) return { allSigned: true, unsigned: [] }

  const { data: sigs } = await supabase
    .from('waiver_signatures')
    .select('waiver_id')
    .eq('user_id', userId)
    .in('waiver_id', waivers.map((w) => w.id))

  const signedIds = new Set((sigs ?? []).map((s) => s.waiver_id))
  const unsigned = waivers.filter((w) => w.is_required && !signedIds.has(w.id))

  return { allSigned: unsigned.length === 0, unsigned }
}

// ── T-072: Attendee session notes ────────────────────────────────────────────

export async function getSessionNote(sessionId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_notes')
    .select('body, updated_at')
    .eq('session_id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle()
  return data
}

export async function saveSessionNote(sessionId: string, body: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('session_notes').upsert(
    { session_id: sessionId, user_id: user.id, body, updated_at: new Date().toISOString() },
    { onConflict: 'session_id,user_id' },
  )
  if (error) return { error: error.message }
  return { success: true }
}

// ── T-072a: Session chat + Q&A ───────────────────────────────────────────────

export async function postSessionMessage(sessionId: string, body: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('session_messages')
    .insert({ session_id: sessionId, user_id: user.id, body })
    .select('id, body, created_at, user_id')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function getSessionMessages(sessionId: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_messages')
    .select('id, body, created_at, user_id, profiles(full_name, avatar_url)')
    .eq('session_id', sessionId)
    .eq('is_moderated', false)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data ?? []
}

export async function postSessionQuestion(sessionId: string, body: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('session_questions')
    .insert({ session_id: sessionId, user_id: user.id, body })
    .select('id, body, upvote_count, is_answered, created_at')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function getSessionQuestions(sessionId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_questions')
    .select('id, body, upvote_count, is_answered, created_at, user_id, profiles(full_name)')
    .eq('session_id', sessionId)
    .eq('is_moderated', false)
    .order('upvote_count', { ascending: false })
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function upvoteSessionQuestion(questionId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { error: upvoteError } = await supabase
    .from('session_question_upvotes')
    .insert({ question_id: questionId, user_id: user.id })

  if (upvoteError) {
    if (upvoteError.code === '23505') return { error: 'Already upvoted' }
    return { error: upvoteError.message }
  }

  const { count } = await supabase
    .from('session_question_upvotes')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', questionId)
  await supabase
    .from('session_questions')
    .update({ upvote_count: count ?? 0 })
    .eq('id', questionId)

  return { success: true }
}

export async function markQuestionAnswered(questionId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('session_questions').update({ is_answered: true }).eq('id', questionId)
  revalidatePath('/events')
}
