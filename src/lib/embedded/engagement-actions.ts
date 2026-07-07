'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { getLeaderboard } from '@/lib/engagement/sprint10-actions'
import { POINT_VALUES } from '@/lib/engagement/point-values'

// ── Embed context ─────────────────────────────────────────────────────────────

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
  const db = createAdminClient()
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) throw new Error('Location not linked to any organization')
  return { db, orgId: link.org_id }
}

async function assertEventOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

async function assertEventOwnershipBySlug(
  db: ReturnType<typeof createAdminClient>,
  slug: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('slug', slug)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function embedGetLeaderboardData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('leaderboard_point_config, slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  const leaders = await getLeaderboard(eventId)

  const nameMap: Record<string, string> = {}
  if (leaders.length > 0) {
    const { data: regs } = await db
      .from('registrations')
      .select('user_id, attendee_name, attendee_email')
      .eq('event_id', eventId)
      .in('user_id', leaders.map(l => l.userId))
    for (const r of (regs ?? []) as any[]) {
      nameMap[r.user_id] = r.attendee_name ?? r.attendee_email ?? 'Attendee'
    }
  }

  const dbConfig = ((event as any)?.leaderboard_point_config ?? {}) as Record<string, number>
  const mergedConfig: Record<string, number> = { ...POINT_VALUES, ...dbConfig }

  return { eventSlug: (event as any)?.slug as string, leaders, nameMap, mergedConfig }
}

export async function embedUpdateLeaderboardPointConfig(
  eventId: string,
  config: Record<string, number>,
): Promise<{ ok?: boolean; error?: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('events')
    .update({ leaderboard_point_config: config })
    .eq('id', eventId)
    .eq('org_id', orgId)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Photos ────────────────────────────────────────────────────────────────────

export async function embedGetPhotosData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { count } = await db
    .from('photo_contest_entries')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const { data: event } = await db
    .from('events')
    .select('slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  return { count: count ?? 0, eventSlug: (event as any)?.slug as string }
}

// ── Icebreakers ───────────────────────────────────────────────────────────────

export async function embedGetIcebreakersData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('title, slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  const { data: rawQuestions } = await db
    .from('icebreaker_questions')
    .select('id, question, question_text, prompt, category, is_active')
    .eq('event_id', eventId)
    .limit(100)

  // Resolve {event_title} merge tag at read time, same as the standalone page
  const eventTitle = (event as any)?.title ?? ''
  const questions = (rawQuestions ?? []).map((q: any) => ({
    ...q,
    question: typeof q.question === 'string' ? q.question.replaceAll('{event_title}', eventTitle) : q.question,
    question_text: typeof q.question_text === 'string' ? q.question_text.replaceAll('{event_title}', eventTitle) : q.question_text,
    prompt: typeof q.prompt === 'string' ? q.prompt.replaceAll('{event_title}', eventTitle) : q.prompt,
  }))

  const isActive = questions.some((q: any) => q.is_active)

  return { eventSlug: (event as any)?.slug as string, orgId, questions, isActive }
}

export async function embedSeedIcebreakerPrompts(eventId: string, prompts: { text: string; tags: string[] }[]) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // Store {event_title} as-is — resolved at read time — mirrors standalone seedIcebreakerPrompts
  const rows = prompts.map((p) => ({
    event_id: eventId,
    question: p.text,
    question_text: p.text,
    prompt: p.text,
  }))
  const { error } = await db.from('icebreaker_questions').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}

export async function embedSetIcebreakersActive(eventSlug: string, active: boolean) {
  const { db, orgId } = await resolveEmbedContext()
  const event = await assertEventOwnershipBySlug(db, eventSlug, orgId)
  await db.from('icebreaker_questions').update({ is_active: active }).eq('event_id', event.id)
  return { ok: true }
}

// ── Trivia ────────────────────────────────────────────────────────────────────

export async function embedGetTriviaData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  const { data: questions } = await db
    .from('trivia_questions')
    .select('id, body, question_text, options, correct_index, category, difficulty, points, sort_order, is_active')
    .eq('event_id', eventId)
    .order('sort_order')

  const isActive = (questions ?? []).some((q: any) => q.is_active)

  return { eventSlug: (event as any)?.slug as string, orgId, questions: (questions ?? []) as any[], isActive }
}

export async function embedSeedTriviaQuestions(
  eventId: string,
  questions: { q: string; options: string[]; correct: number; category: string; difficulty: string }[],
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // Same validation as standalone seedTriviaQuestions, so the client sees a useful message
  for (const q of questions) {
    if (!Array.isArray(q.options) || q.options.filter((o) => typeof o === 'string' && o.trim().length > 0).length < 2) {
      return { error: 'Questions must have at least 2 answer options' }
    }
  }

  const rows = questions.map((q) => ({
    event_id: eventId,
    body: q.q,              // primary display column (what getTriviaQuestions reads)
    question_text: q.q,     // alias for future use
    options: q.options,
    correct_index: q.correct,
    category: q.category,
    difficulty: q.difficulty,
  }))
  const { error } = await db.from('trivia_questions').insert(rows)
  if (error) return { error: error.message }
  return { count: rows.length }
}

export async function embedSetTriviaActive(eventSlug: string, active: boolean) {
  const { db, orgId } = await resolveEmbedContext()
  const event = await assertEventOwnershipBySlug(db, eventSlug, orgId)
  await db.from('trivia_questions').update({ is_active: active }).eq('event_id', event.id)
  return { ok: true }
}
