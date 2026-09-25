'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { POINT_VALUES } from '@/lib/engagement/point-values'
import { awardPoints, awardPointsForReg } from '@/lib/engagement/points'
import { resolveOwnedRegistration } from '@/lib/auth/owned-registration'

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

  // Vote-count rollup runs on behalf of the voter. Reading peer votes and
  // updating the question are not permitted under the user-scoped policies,
  // so use admin client for the tally + write-back.
  const admin = createAdminClient()
  const { data: q } = await admin
    .from('session_questions')
    .select('poll_options')
    .eq('id', questionId)
    .single()

  const options = ((q as any)?.poll_options ?? []) as any[]
  const { data: votes } = await admin
    .from('poll_votes')
    .select('option_index')
    .eq('question_id', questionId)

  const counts: Record<number, number> = {}
  for (const v of (votes ?? []) as any[]) {
    counts[v.option_index] = (counts[v.option_index] ?? 0) + 1
  }

  const updatedOptions = options.map((opt: any, i: number) => ({ ...opt, votes: counts[i] ?? 0 }))
  await admin.from('session_questions').update({ poll_options: updatedOptions }).eq('id', questionId)

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
  const admin = createAdminClient()
  const { data } = await admin
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
  // Vote count is bumped on behalf of the voter, who doesn't own the entry —
  // use admin client to perform the increment.
  const admin = createAdminClient()
  const { data: entry } = await admin
    .from('photo_contest_entries')
    .select('vote_count')
    .eq('id', entryId)
    .single()
  await admin.from('photo_contest_entries')
    .update({ vote_count: ((entry as any)?.vote_count ?? 0) + 1 })
    .eq('id', entryId)
  return { ok: true }
}

// ── T-106: trivia ─────────────────────────────────────────────────────────────

export async function getTriviaQuestions(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('trivia_questions')
    .select('id, body, question_text, options, category, difficulty, points, sort_order')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('sort_order')
  return (data ?? []) as any[]
}

export async function setTriviaActive(eventSlug: string, active: boolean) {
  let access: Awaited<ReturnType<typeof requireEventOrgAccess>>
  try {
    access = await requireEventOrgAccess(eventSlug)
  } catch {
    return { error: 'Not authorized' }
  }
  const admin = createAdminClient()
  await admin.from('trivia_questions').update({ is_active: active }).eq('event_id', access.event.id)
  return { ok: true }
}

// Points go to the caller's own registration for the question's event: a
// logged-in attendee's confirmed registration, or — for a guest — the
// registration whose qr_code token they present. Never a caller-supplied id.
// A question awards once per identity: trivia_answers is unique on
// (question_id, user_id); guest points are unique on (event, registration,
// action) via leaderboard_points_reg_action_idx.
export async function submitTriviaAnswer(questionId: string, answerIndex: number, registrationToken?: string) {
  if (!Number.isInteger(answerIndex)) return { error: 'Invalid answer', correct: false }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user && !registrationToken) return { error: 'Enter your registration code to participate', correct: false }

  // Read trivia question via admin client — guest path has no auth.uid() so
  // the user-scoped RLS policy would return nothing.
  const admin = createAdminClient()
  const { data: q } = await admin
    .from('trivia_questions')
    .select('id, correct_index, points, event_id')
    .eq('id', questionId)
    .maybeSingle()
  if (!q) return { error: 'Question not found', correct: false }
  const eventId = (q as any).event_id as string

  const isCorrect = (q as any).correct_index === answerIndex

  let awardedPoints = 0
  if (user) {
    const reg = await resolveOwnedRegistration({ type: 'user', userId: user.id }, eventId)
    if (!reg) return { error: 'You are not registered for this event', correct: false }
    const { error } = await supabase.from('trivia_answers').insert({
      question_id: questionId,
      user_id: user.id,
      answer_index: answerIndex,
      is_correct: isCorrect,
    })
    if (error) return { error: error.code === '23505' ? 'Already answered' : error.message, correct: false }
    if (isCorrect) awardedPoints = await awardPoints(eventId, user.id, 'trivia_correct', (q as any).points)
  } else {
    const { data: reg } = await admin
      .from('registrations')
      .select('id')
      .eq('qr_code', registrationToken!)
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .maybeSingle()
    if (!reg) return { error: 'Registration code not recognised for this event', correct: false }
    if (isCorrect) awardedPoints = await awardPointsForReg(eventId, reg.id, 'trivia_correct', (q as any).points)
  }

  return { correct: isCorrect, points: isCorrect ? awardedPoints : 0, correctIndex: (q as any).correct_index }
}

// ── T-107: icebreaker contest ─────────────────────────────────────────────────

export async function getIcebreakerQuestions(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('icebreaker_questions')
    .select('id, question, question_text, prompt, category, is_active')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(100)
  return (data ?? []) as any[]
}

export async function setIcebreakersActive(eventSlug: string, active: boolean) {
  let access: Awaited<ReturnType<typeof requireEventOrgAccess>>
  try {
    access = await requireEventOrgAccess(eventSlug)
  } catch {
    return { error: 'Not authorized' }
  }
  const admin = createAdminClient()
  await admin.from('icebreaker_questions').update({ is_active: active }).eq('event_id', access.event.id)
  return { ok: true }
}

export async function submitIcebreakerResponse(eventId: string, questionId: string, response: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Enter your registration code to participate', points: 0 }

  const { error } = await supabase.from('icebreaker_completions').upsert({
    event_id: eventId,
    user_id: user.id,
    question_id: questionId,
    response,
  }, { onConflict: 'event_id,user_id,question_id' })
  let points = 0
  if (!error) points = await awardPoints(eventId, user.id, 'icebreaker')
  return { error: error?.message, points }
}

// ── T-108: passport contest ───────────────────────────────────────────────────

export async function getPassportLocations(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('passport_locations')
    .select('id, name, points')
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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Enter your registration code to participate' }

  const { data: loc } = await supabase
    .from('passport_locations')
    .select('id, name, points')
    .eq('event_id', eventId)
    .eq('code', code.trim().toUpperCase())
    .single()
  if (!loc) return { error: 'Invalid code' }

  const { error } = await supabase.from('passport_visits').insert({
    event_id: eventId,
    user_id: user.id,
    location_id: (loc as any).id,
  })
  if (error && error.code === '23505') return { error: 'Already visited this location' }
  if (error) return { error: error.message }
  const visitPoints = await awardPoints(eventId, user.id, 'passport_visit', (loc as any).points)

  const completionAdmin = createAdminClient()
  const { count: locCount } = await completionAdmin.from('passport_locations')
    .select('id', { count: 'exact', head: true }).eq('event_id', eventId)
  const { count: visitCount } = await completionAdmin.from('passport_visits')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId).eq('user_id', user.id)
  if (locCount && visitCount === locCount) {
    const bonusPoints = await awardPoints(eventId, user.id, 'passport_complete')
    return { ok: true, locationId: (loc as any).id, location: (loc as any).name, points: visitPoints, completedPassport: true, bonusPoints }
  }

  return { ok: true, locationId: (loc as any).id, location: (loc as any).name, points: visitPoints }
}

export async function getIcebreakerResponses(eventId: string, questionId: string) {
  const supabase = await createClient()
  const { data: registered } = await supabase.rpc('is_registered', { event_id: eventId })
  if (!registered) return []

  const admin = createAdminClient()
  const { data: completions } = await admin
    .from('icebreaker_completions')
    .select('user_id, response')
    .eq('event_id', eventId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(20)

  const rows = (completions ?? []) as any[]
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map(r => r.user_id))]
  const { data: visible } = await supabase
    .from('event_visible_profiles')
    .select('user_id, attendee_name, handle, avatar_url')
    .eq('event_id', eventId)
    .in('user_id', userIds)

  const byUser = new Map(((visible ?? []) as any[]).map(p => [p.user_id, p]))

  return rows.map(r => {
    const p = byUser.get(r.user_id)
    return {
      name: p?.attendee_name || 'An attendee',
      handle: p?.handle ?? null,
      avatarUrl: p?.avatar_url ?? null,
      response: r.response,
    }
  })
}

export async function seedIcebreakerPrompts(eventId: string, prompts: { text: string; tags: string[] }[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Verify caller is an org member of the event's org, then insert via admin client.
  // The user-scoped RLS path is too narrow for org-staff seed actions on older policies.
  const { data: event } = await supabase
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }
  const admin = createAdminClient()
  const { data: member } = await admin
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return { error: 'Forbidden' }

  // Store {event_title} as-is — resolve at read time so prompts stay in sync if title changes.
  const rows = prompts.map((p) => ({
    event_id: eventId,
    question: p.text,
    question_text: p.text,
    prompt: p.text,
  }))
  const { error } = await admin.from('icebreaker_questions').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}

export async function seedTriviaQuestions(eventId: string, questions: { q: string; options: string[]; correct: number; category: string; difficulty: string }[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  // Validate before hitting the DB so the client sees a useful message
  for (const q of questions) {
    if (!Array.isArray(q.options) || q.options.filter((o) => typeof o === 'string' && o.trim().length > 0).length < 2) {
      return { error: 'Questions must have at least 2 answer options' }
    }
  }

  // Verify caller is an org member, then insert via admin client
  const { data: event } = await supabase
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }
  const admin = createAdminClient()
  const { data: member } = await admin
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return { error: 'Forbidden' }

  const rows = questions.map((q) => ({
    event_id: eventId,
    body: q.q,              // primary display column (what getTriviaQuestions reads)
    question_text: q.q,     // alias for future use
    options: q.options,
    correct_index: q.correct,
    category: q.category,
    difficulty: q.difficulty,
  }))
  const { error } = await admin.from('trivia_questions').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}
