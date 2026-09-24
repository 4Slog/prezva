'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'

export async function createPoll(sessionId: string, eventId: string, question: string, options: string[]) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('session_polls')
    .insert({ session_id: sessionId, event_id: eventId, question, options })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

// The poll's event comes from the poll row; the caller needs agenda.manage on
// that event's org.
async function authorizePoll(pollId: string): Promise<{ error: string } | { poll: { id: string; session_id: string; event_id: string } }> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: poll } = await admin.from('session_polls').select('id, session_id, event_id').eq('id', pollId).maybeSingle()
  if (!poll) return { error: 'Poll not found' }
  const { data: event } = await admin.from('events').select('org_id').eq('id', poll.event_id).maybeSingle()
  if (!event) return { error: 'Event not found' }
  try { await assertPermission(event.org_id as string, user.id, 'agenda.manage') } catch (e) { return catchPermission(e) }
  return { poll: poll as { id: string; session_id: string; event_id: string } }
}

async function updatePoll(pollId: string, eventId: string, values: Record<string, unknown>) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('session_polls')
    .update(values)
    .eq('id', pollId)
    .eq('event_id', eventId)
    .select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Poll not found' }
  return { success: true }
}

export async function activatePoll(pollId: string) {
  const auth = await authorizePoll(pollId)
  if ('error' in auth) return auth
  const admin = createAdminClient()
  // Deactivate the other polls in the same session (same event) first
  await admin
    .from('session_polls')
    .update({ is_active: false })
    .eq('session_id', auth.poll.session_id)
    .eq('event_id', auth.poll.event_id)
    .neq('id', pollId)
  return updatePoll(pollId, auth.poll.event_id, { is_active: true, closed_at: null })
}

export async function closePoll(pollId: string) {
  const auth = await authorizePoll(pollId)
  if ('error' in auth) return auth
  return updatePoll(pollId, auth.poll.event_id, { is_active: false, closed_at: new Date().toISOString() })
}

export async function showResults(pollId: string, show: boolean) {
  const auth = await authorizePoll(pollId)
  if ('error' in auth) return auth
  return updatePoll(pollId, auth.poll.event_id, { show_results: show })
}

export async function submitVote(pollId: string, optionIndex: number, userId?: string, registrationId?: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('session_poll_votes')
    .insert({ poll_id: pollId, option_index: optionIndex, user_id: userId ?? null, registration_id: registrationId ?? null })
  if (error) {
    // Duplicate vote — ignore silently
    if (error.code === '23505') return { success: true, duplicate: true }
    return { error: error.message }
  }
  return { success: true }
}

export async function getPollsForSession(sessionId: string) {
  const admin = createAdminClient()
  const { data: polls, error } = await admin
    .from('session_polls')
    .select('*, session_poll_votes(option_index)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (polls ?? []).map((p: any) => {
    const options: string[] = Array.isArray(p.options) ? p.options : []
    const voteCounts = options.map((_: string, i: number) =>
      (p.session_poll_votes ?? []).filter((v: any) => v.option_index === i).length
    )
    const { session_poll_votes: _, ...rest } = p
    return { ...rest, options, voteCounts, totalVotes: (p.session_poll_votes ?? []).length }
  })
}
