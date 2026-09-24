import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Server-only reads. These trust their arguments (ids resolved upstream: the
// speaker hub page from the validated speaker token, the dashboard messages
// page after its org check), so they must never be server-action exports.

export async function getSpeakerFormSubmission(eventId: string, speakerId: string) {
  // speaker_form_submissions is service-role only.
  const admin = createAdminClient()
  const { data } = await admin
    .from('speaker_form_submissions')
    .select('data')
    .eq('event_id', eventId)
    .eq('speaker_id', speakerId)
    .single()
  return (data as any)?.data ?? {}
}

export async function getSessionHandouts(sessionId: string) {
  // Speaker portal context has no auth.uid so the user-scoped RLS policy
  // returns nothing. Speakers are gated by the speaker_token upstream.
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_handouts')
    .select('id, filename, storage_path, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  return (data ?? []) as any[]
}

export async function getSessionFeedbackForSpeaker(sessionIds: string[]) {
  if (sessionIds.length === 0) return {}
  // Speaker portal context has no auth.uid; attendees see only their own
  // feedback via RLS. Speakers reach this through speaker_token validation.
  const admin = createAdminClient()
  const { data } = await admin
    .from('session_feedback')
    .select('session_id, rating, comment, created_at')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
  const bySession: Record<string, { ratings: number[]; avg: number; count: number; comments: string[] }> = {}
  for (const fb of (data ?? []) as any[]) {
    if (!bySession[fb.session_id]) bySession[fb.session_id] = { ratings: [], avg: 0, count: 0, comments: [] }
    bySession[fb.session_id].ratings.push(fb.rating)
    if (fb.comment?.trim()) {
      bySession[fb.session_id].comments.push(fb.comment.trim())
    }
  }
  for (const val of Object.values(bySession)) {
    val.avg = val.ratings.reduce((s, r) => s + r, 0) / val.ratings.length
    val.count = val.ratings.length
    val.comments = val.comments.slice(0, 20)
  }
  return bySession
}

export async function getSpeakerSessionsWithQA(speakerId: string, eventId: string) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: sessionSpeakers } = await supabase
    .from('session_speakers')
    .select('session_id, role, sessions(id, title, starts_at, ends_at)')
    .eq('speaker_id', speakerId)

  const sessionIds = ((sessionSpeakers ?? []) as any[]).map(ss => ss.session_id)
  if (sessionIds.length === 0) return []

  const [{ data: questions }, { data: coSpeakerRows }, { data: handoutRows }] = await Promise.all([
    // session_questions read uses admin client — speaker portal has no auth.uid
    // and the user-scoped policy would only return the speaker's own questions.
    admin
      .from('session_questions')
      .select('id, session_id, body, upvote_count, is_poll, poll_options, answered_at, is_hidden, is_pinned, organizer_answer, created_at')
      .in('session_id', sessionIds)
      .eq('event_id', eventId)
      .eq('is_hidden', false)
      .order('is_pinned', { ascending: false })
      .order('upvote_count', { ascending: false }),
    supabase
      .from('session_speakers')
      .select('session_id, role, speakers(id, name, job_title, company, photo_url, event_role)')
      .in('session_id', sessionIds)
      .neq('speaker_id', speakerId),
    admin
      .from('session_handouts')
      .select('id, session_id, speaker_id, filename, storage_path, version, is_latest, created_at')
      .in('session_id', sessionIds)
      .eq('speaker_id', speakerId)
      .eq('is_latest', true)
      .order('created_at', { ascending: true }),
  ])

  return ((sessionSpeakers ?? []) as any[]).map(ss => ({
    session: ss.sessions ? { ...ss.sessions, session_role: ss.role ?? 'presenter' } : null,
    questions: ((questions ?? []) as any[]).filter(q => q.session_id === ss.session_id && !q.is_poll),
    polls: ((questions ?? []) as any[]).filter(q => q.session_id === ss.session_id && q.is_poll),
    handouts: ((handoutRows ?? []) as any[]).filter(h => h.session_id === ss.session_id),
    co_speakers: ((coSpeakerRows ?? []) as any[])
      .filter(cs => cs.session_id === ss.session_id)
      .map(cs => ({ ...cs.speakers, session_role: cs.role ?? 'presenter' }))
      .filter(Boolean),
  }))
}

export async function getSpeakerConversations(eventId: string) {
  // speaker_conversations + speaker_messages are service-role only.
  const admin = createAdminClient()
  const { data } = await admin
    .from('speaker_conversations')
    .select('id, speaker_id, speakers(name, email), speaker_messages(body, created_at, sender_role)')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}
