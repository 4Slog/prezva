'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

export async function activatePoll(pollId: string) {
  const admin = createAdminClient()
  // First get the session_id so we can deactivate other polls in same session
  const { data: poll } = await admin
    .from('session_polls')
    .select('session_id')
    .eq('id', pollId)
    .single()
  if (poll) {
    await admin
      .from('session_polls')
      .update({ is_active: false })
      .eq('session_id', poll.session_id)
      .neq('id', pollId)
  }
  const { error } = await admin
    .from('session_polls')
    .update({ is_active: true, closed_at: null })
    .eq('id', pollId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function closePoll(pollId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('session_polls')
    .update({ is_active: false, closed_at: new Date().toISOString() })
    .eq('id', pollId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function showResults(pollId: string, show: boolean) {
  const admin = createAdminClient()
  const { error } = await admin
    .from('session_polls')
    .update({ show_results: show })
    .eq('id', pollId)
  if (error) return { error: error.message }
  return { success: true }
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
