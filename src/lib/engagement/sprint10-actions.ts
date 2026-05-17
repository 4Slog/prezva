'use server'

import { createClient } from '@/lib/supabase/server'
import { POINT_VALUES } from '@/lib/engagement/point-values'

// ── T-100: email campaigns ─────────────────────────────────────────────────────

export async function createEmailCampaign(eventId: string, subject: string, body: string, audienceFilter: Record<string, string[]> = {}) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  const { data, error } = await supabase.from('email_campaigns').insert({
    event_id: eventId,
    subject,
    body,
    audience_filter: audienceFilter,
    status: 'pending',
    created_by: user.data.user?.id,
  }).select('id').single()
  if (error) return { error: error.message }
  return { id: (data as any).id }
}

export async function getEmailCampaigns(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_campaigns')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

// ── T-100a: live polling ───────────────────────────────────────────────────────

export async function castPollVote(questionId: string, optionIndex: number) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('poll_votes').upsert({
    question_id: questionId,
    option_index: optionIndex,
    user_id: user.data.user.id,
  }, { onConflict: 'question_id,user_id' })
  if (error) return { error: error.message }

  // Update poll_options vote counts
  const { data: q } = await supabase
    .from('session_questions')
    .select('poll_options')
    .eq('id', questionId)
    .single()

  const options = ((q as any)?.poll_options ?? []) as any[]
  const { data: votes } = await supabase
    .from('poll_votes')
    .select('option_index')
    .eq('question_id', questionId)

  const counts: Record<number, number> = {}
  for (const v of (votes ?? []) as any[]) {
    counts[v.option_index] = (counts[v.option_index] ?? 0) + 1
  }

  const updatedOptions = options.map((opt: any, i: number) => ({ ...opt, votes: counts[i] ?? 0 }))
  await supabase.from('session_questions').update({ poll_options: updatedOptions }).eq('id', questionId)

  return { ok: true }
}

export async function getUserPollVotes(questionIds: string[]) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user || questionIds.length === 0) return {}
  const { data } = await supabase
    .from('poll_votes')
    .select('question_id, option_index')
    .in('question_id', questionIds)
    .eq('user_id', user.data.user.id)
  const result: Record<string, number> = {}
  for (const v of (data ?? []) as any[]) result[v.question_id] = v.option_index
  return result
}

// ── T-101: poll templates ─────────────────────────────────────────────────────

export async function getPollTemplates(category?: string) {
  const supabase = await createClient()
  let q = supabase.from('poll_templates').select('*').order('category').order('body')
  if (category) q = q.eq('category', category)
  const { data } = await q
  return (data ?? []) as any[]
}

// ── T-101a: survey templates ──────────────────────────────────────────────────

export async function getSurveyTemplates() {
  const supabase = await createClient()
  const { data } = await supabase.from('survey_templates').select('*').order('name')
  return (data ?? []) as any[]
}

// ── T-102: session feedback ───────────────────────────────────────────────────

export async function submitSessionFeedback(sessionId: string, eventId: string, rating: number, comment?: string) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return { error: 'Not authenticated' }
  const { error } = await supabase.from('session_feedback').upsert({
    session_id: sessionId,
    event_id: eventId,
    user_id: user.data.user.id,
    rating,
    comment: comment ?? null,
  }, { onConflict: 'session_id,user_id' })
  return { error: error?.message }
}

export async function getSessionFeedback(sessionId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_feedback')
    .select('rating, comment, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
  const items = (data ?? []) as any[]
  const avg = items.length > 0 ? items.reduce((s, i) => s + i.rating, 0) / items.length : null
  return { items, avg, count: items.length }
}

// ── T-104: leaderboard ────────────────────────────────────────────────────────

export async function awardPoints(eventId: string, userId: string, action: string) {
  const supabase = await createClient()

  // Try to get event-specific config, fall back to defaults
  let points = POINT_VALUES[action] ?? 1
  try {
    const { data: event } = await supabase
      .from('events')
      .select('leaderboard_point_config')
      .eq('id', eventId)
      .single()
    if (event?.leaderboard_point_config) {
      const config = event.leaderboard_point_config as Record<string, number>
      if (typeof config[action] === 'number') points = config[action]
    }
  } catch {
    // fall back to default
  }

  const { error } = await supabase
    .from('leaderboard_points')
    .insert({ event_id: eventId, user_id: userId, action, points })
  // Ignore unique constraint violations (23505) — duplicate award attempt, silently skip
  if (error && !error.code?.includes('23505')) {
    console.error('[leaderboard] awardPoints error:', error.message)
  }
}

export async function updateLeaderboardPointConfig(eventId: string, config: Record<string, number>) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('events')
    .update({ leaderboard_point_config: config })
    .eq('id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function getLeaderboard(eventId: string, limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leaderboard_points')
    .select('user_id, points')
    .eq('event_id', eventId)
  const totals: Record<string, number> = {}
  for (const row of (data ?? []) as any[]) {
    totals[row.user_id] = (totals[row.user_id] ?? 0) + row.points
  }
  const sorted = Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([userId, total], idx) => ({ rank: idx + 1, userId, total }))
  return sorted
}

// ── T-105: photo contest ──────────────────────────────────────────────────────

export async function getPhotoEntries(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('photo_contest_entries')
    .select('id, caption, storage_path, vote_count, is_winner, user_id, created_at')
    .eq('event_id', eventId)
    .order('vote_count', { ascending: false })
  return (data ?? []) as any[]
}

export async function voteForPhoto(entryId: string) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return { error: 'Not authenticated' }
  const { error } = await supabase.from('photo_contest_votes').insert({
    entry_id: entryId,
    user_id: user.data.user.id,
  })
  if (error) return { error: error.message }
  // Increment vote_count
  const { data: entry } = await supabase
    .from('photo_contest_entries')
    .select('vote_count')
    .eq('id', entryId)
    .single()
  await supabase.from('photo_contest_entries')
    .update({ vote_count: ((entry as any)?.vote_count ?? 0) + 1 })
    .eq('id', entryId)
  return { ok: true }
}

// ── T-106: trivia ─────────────────────────────────────────────────────────────

export async function getTriviaQuestions(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('trivia_questions')
    .select('id, body, question_text, options, correct_index, category, difficulty, points, sort_order')
    .eq('event_id', eventId)
    .order('sort_order')
  return (data ?? []) as any[]
}

export async function submitTriviaAnswer(questionId: string, answerIndex: number) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return { error: 'Not authenticated', correct: false }

  const { data: q } = await supabase
    .from('trivia_questions')
    .select('correct_index, points, event_id')
    .eq('id', questionId)
    .single()
  if (!q) return { error: 'Question not found', correct: false }

  const isCorrect = (q as any).correct_index === answerIndex
  const { error } = await supabase.from('trivia_answers').insert({
    question_id: questionId,
    user_id: user.data.user.id,
    answer_index: answerIndex,
    is_correct: isCorrect,
  })
  if (error) return { error: error.message, correct: false }

  if (isCorrect) {
    await awardPoints((q as any).event_id, user.data.user.id, 'trivia_correct')
  }
  return { correct: isCorrect, points: isCorrect ? (q as any).points : 0 }
}

// ── T-107: icebreaker contest ─────────────────────────────────────────────────

export async function getIcebreakerQuestions(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('icebreaker_questions')
    .select('id, question, question_text, prompt, category, is_active')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(100)
  return (data ?? []) as any[]
}

export async function submitIcebreakerResponse(eventId: string, questionId: string, response: string) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return { error: 'Not authenticated' }
  const { error } = await supabase.from('icebreaker_completions').upsert({
    event_id: eventId,
    user_id: user.data.user.id,
    question_id: questionId,
    response,
  }, { onConflict: 'event_id,user_id,question_id' })
  if (!error) await awardPoints(eventId, user.data.user.id, 'icebreaker')
  return { error: error?.message }
}

// ── T-108: passport contest ───────────────────────────────────────────────────

export async function getPassportLocations(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('passport_locations')
    .select('id, name, code, points')
    .eq('event_id', eventId)
  return (data ?? []) as any[]
}

export async function getPassportVisits(eventId: string) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return []
  const { data } = await supabase
    .from('passport_visits')
    .select('location_id')
    .eq('event_id', eventId)
    .eq('user_id', user.data.user.id)
  return ((data ?? []) as any[]).map(v => v.location_id)
}

export async function checkInPassportLocation(eventId: string, code: string) {
  const supabase = await createClient()
  const user = await supabase.auth.getUser()
  if (!user.data.user) return { error: 'Not authenticated' }

  const { data: loc } = await supabase
    .from('passport_locations')
    .select('id, name, points')
    .eq('event_id', eventId)
    .eq('code', code.trim().toUpperCase())
    .single()
  if (!loc) return { error: 'Invalid code' }

  const { error } = await supabase.from('passport_visits').insert({
    event_id: eventId,
    user_id: user.data.user.id,
    location_id: (loc as any).id,
  })
  if (error && error.code === '23505') return { error: 'Already visited this location' }
  if (error) return { error: error.message }

  await awardPoints(eventId, user.data.user.id, 'passport_visit')
  return { ok: true, location: (loc as any).name, points: (loc as any).points }
}

export async function seedIcebreakerPrompts(eventId: string, prompts: { text: string; tags: string[] }[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const rows = prompts.map((p) => ({ 
    event_id: eventId, 
    question: p.text,       // primary NOT NULL column
    question_text: p.text,  // alias column for future use
    prompt: p.text,         // legacy alias
  }))
  const { error } = await supabase.from('icebreaker_questions').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}

export async function seedTriviaQuestions(eventId: string, questions: { q: string; options: string[]; correct: number; category: string; difficulty: string }[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const rows = questions.map((q) => ({
    event_id: eventId,
    body: q.q,              // primary display column (what getTriviaQuestions reads)
    question_text: q.q,     // alias for future use
    options: q.options,
    correct_index: q.correct,
    category: q.category,
    difficulty: q.difficulty,
  }))
  const { error } = await supabase.from('trivia_questions').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}
