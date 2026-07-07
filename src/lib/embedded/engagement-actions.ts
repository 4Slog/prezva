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

// ── Passport ──────────────────────────────────────────────────────────────────

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0/O, 1/I)
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function embedGetPassportData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [locRes, visitRes, topRes] = await Promise.all([
    db.from('passport_locations').select('id, name, code, points, created_at').eq('event_id', eventId).order('created_at'),
    db.from('passport_visits').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    db
      .from('passport_visits')
      .select('user_id, passport_locations(points)')
      .eq('event_id', eventId),
  ])

  const visits = (topRes.data ?? []) as any[]
  const userIds = [...new Set(visits.map(v => v.user_id).filter(Boolean))] as string[]

  const nameByUser: Record<string, string> = {}
  if (userIds.length > 0) {
    const [regRes, profRes] = await Promise.all([
      db.from('registrations').select('user_id, attendee_name').eq('event_id', eventId).in('user_id', userIds),
      db.from('profiles').select('id, full_name').in('id', userIds),
    ])
    for (const r of (regRes.data ?? []) as any[]) {
      if (r.user_id && r.attendee_name) nameByUser[r.user_id] = r.attendee_name
    }
    for (const p of (profRes.data ?? []) as any[]) {
      if (p.full_name) nameByUser[p.id] = p.full_name
    }
  }

  const byPerson: Record<string, { userId: string; name: string; count: number; totalPoints: number }> = {}
  for (const v of visits) {
    if (!v.user_id) continue
    const key = v.user_id as string
    const pts = (v as any).passport_locations?.points ?? 0
    if (!byPerson[key]) byPerson[key] = { userId: key, name: nameByUser[key] ?? 'Unknown', count: 0, totalPoints: 0 }
    byPerson[key].count++
    byPerson[key].totalPoints += pts
  }
  const leaderboard = Object.values(byPerson)
    .sort((a, b) => b.totalPoints - a.totalPoints || b.count - a.count)
    .slice(0, 10)

  return {
    locations: (locRes.data ?? []) as { id: string; name: string; code: string; points: number; created_at: string }[],
    totalStamps: visitRes.count ?? 0,
    leaderboard,
  }
}

export async function embedCreatePassportLocation(eventId: string, name: string, points: number) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const code = randomCode(6)
  const { data, error } = await db
    .from('passport_locations')
    .insert({ event_id: eventId, name, code, points: Math.max(1, points) })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function embedDeletePassportLocation(locationId: string, eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('passport_locations')
    .delete()
    .eq('id', locationId)
    .eq('event_id', eventId)

  if (error) return { error: error.message }
  return { ok: true }
}

// ── Networking ────────────────────────────────────────────────────────────────

export async function embedGetNetworkingData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // LEFT JOIN profiles so attendees without global profiles still appear. No self-exclusion — embed has no auth user.
  const { data: regs } = await db
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, profiles!left(id, full_name, avatar_url, job_title, company, bio)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (!regs) return { attendees: [] }

  // Fetch interests from attendee_profiles (event-specific networking profiles)
  const regIds = (regs as any[]).map(r => r.id)
  const interestMap: Record<string, string[]> = {}
  if (regIds.length > 0) {
    const { data: atProfiles } = await db
      .from('attendee_profiles')
      .select('registration_id, interests')
      .in('registration_id', regIds)
    for (const ap of atProfiles ?? []) {
      interestMap[(ap as any).registration_id] = (ap as any).interests ?? []
    }
  }

  // Fetch opt-out prefs; if no row exists, attendee is visible by default (networking_show_in_dir = true)
  const userIds = (regs as any[]).map((r: any) => r.user_id).filter(Boolean)
  const hiddenSet = new Set<string>()
  if (userIds.length > 0) {
    const { data: prefs } = await db
      .from('attendee_preferences')
      .select('user_id, networking_show_in_dir')
      .in('user_id', userIds)
    for (const p of prefs ?? []) {
      if ((p as any).networking_show_in_dir === false) {
        hiddenSet.add((p as any).user_id)
      }
    }
  }

  // Per-event avatar override (attendee_profiles.avatar_url)
  const overrideAvatar = new Map<string, string | null>()
  if (userIds.length > 0) {
    const { data: overrides } = await db
      .from('attendee_profiles')
      .select('user_id, avatar_url')
      .eq('event_id', eventId)
      .in('user_id', userIds)
    for (const o of (overrides ?? []) as any[]) overrideAvatar.set(o.user_id, o.avatar_url)
  }

  const visible = (regs as any[]).filter(r => !r.user_id || !hiddenSet.has(r.user_id))
  const attendees = visible.map(r => {
    const profile = (r as any).profiles
    if (!profile) return { ...r, interests: interestMap[r.id] ?? [] }
    const resolvedAvatar = overrideAvatar.get(r.user_id) ?? profile.avatar_url ?? null
    return { ...r, profiles: { ...profile, avatar_url: resolvedAvatar }, interests: interestMap[r.id] ?? [] }
  })

  return { attendees }
}
