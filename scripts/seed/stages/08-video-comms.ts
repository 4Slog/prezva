/**
 * Stage 08 — Video & Comms Seed Data
 *
 * Additive stage. All writes are idempotent:
 *   - UPDATEs re-set same values
 *   - Upsert ON CONFLICT DO NOTHING for session_attendance, attendee_profiles, push_subscriptions
 *   - DELETE WHERE session_id + INSERT for session_questions and community_posts (no natural unique key)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'

// ─── djb2 hash ────────────────────────────────────────────────────────────────

function djb2Hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) & 0xffffffff
  return h >>> 0
}

// ─── Batch helpers ─────────────────────────────────────────────────────────────

async function batchInsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (!rows.length) return 0
  const BATCH = 200
  let count = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) throw new Error(`insert ${table} (batch ${Math.floor(i / BATCH) + 1}): ${error.message}`)
    count += chunk.length
  }
  return count
}

async function batchUpsert(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  if (!rows.length) return 0
  const BATCH = 200
  let count = 0
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict, ignoreDuplicates: true })
    if (error) throw new Error(`upsert ${table} (batch ${Math.floor(i / BATCH) + 1}): ${error.message}`)
    count += chunk.length
  }
  return count
}

// SMS updates: each row has a different phone so we can't batch into one UPDATE call
async function batchUpdateSMS(
  supabase: SupabaseClient,
  rows: Array<{ id: string; attendee_phone: string }>,
): Promise<number> {
  if (!rows.length) return 0
  const CONCURRENT = 20
  let count = 0
  for (let i = 0; i < rows.length; i += CONCURRENT) {
    const chunk = rows.slice(i, i + CONCURRENT)
    const results = await Promise.all(
      chunk.map(row =>
        supabase
          .from('registrations')
          .update({ sms_opt_in: true, attendee_phone: row.attendee_phone })
          .eq('id', row.id),
      ),
    )
    for (const { error } of results) {
      if (error) throw new Error(`update SMS: ${error.message}`)
      count++
    }
  }
  return count
}

// ─── DB row types ─────────────────────────────────────────────────────────────

interface SessionRow { id: string; title: string; starts_at: string; ends_at: string }
interface RegRow { id: string; user_id: string | null; attendee_email: string }

// ─── Main export ──────────────────────────────────────────────────────────────

export async function seedVideoComms(
  supabase: SupabaseClient,
  dryRun: boolean,
): Promise<StageSummary> {
  log.section('Stage 08: Video & Comms')

  // ── Resolve event IDs ───────────────────────────────────────────────────────

  const { data: evtRows, error: evtErr } = await supabase
    .from('events')
    .select('id, slug')
    .in('slug', [
      'saup-ce-conference-2026',
      'oss-atl-virtual-summit-2026',
      'bsbw-2026',
      'oss-atl-may-meetup-2026',
    ])
  if (evtErr) throw new Error(`lookup events: ${evtErr.message}`)

  const evtMap = new Map((evtRows ?? []).map((e: { id: string; slug: string }) => [e.slug, e.id as string]))
  const saupId  = evtMap.get('saup-ce-conference-2026')!
  const ossId   = evtMap.get('oss-atl-virtual-summit-2026')!
  const bsbwId  = evtMap.get('bsbw-2026')!
  const ossMeetupId = evtMap.get('oss-atl-may-meetup-2026')!

  // ── Resolve SAUP session IDs ────────────────────────────────────────────────

  const SAUP_TITLES = [
    'Urban Climate Resilience Policy',
    'Equitable Transit-Oriented Development Workshop',
    'Form-Based Codes in Practice',
    'Complete Streets Implementation',
  ]
  const { data: saupSessRows, error: saupSessErr } = await supabase
    .from('sessions')
    .select('id, title, starts_at, ends_at')
    .eq('event_id', saupId)
    .in('title', SAUP_TITLES)
  if (saupSessErr) throw new Error(`lookup SAUP sessions: ${saupSessErr.message}`)

  const saupSessMap = new Map(
    (saupSessRows ?? []).map((s: SessionRow) => [s.title, s]),
  )

  const saupUCR  = saupSessMap.get('Urban Climate Resilience Policy')!
  const saupETOD = saupSessMap.get('Equitable Transit-Oriented Development Workshop')!
  const saupFBC  = saupSessMap.get('Form-Based Codes in Practice')!
  const saupCS   = saupSessMap.get('Complete Streets Implementation')!

  // ── Resolve OSS Virtual Summit first 3 sessions by starts_at ───────────────

  const { data: ossSessRows, error: ossSessErr } = await supabase
    .from('sessions')
    .select('id, title, starts_at, ends_at')
    .eq('event_id', ossId)
    .order('starts_at')
    .limit(3)
  if (ossSessErr) throw new Error(`lookup OSS sessions: ${ossSessErr.message}`)

  const ossFirst3 = (ossSessRows ?? []) as SessionRow[]
  if (ossFirst3.length < 3) throw new Error(`expected 3 OSS sessions, found ${ossFirst3.length}`)

  const [ossKeynote, ossRust, ossComm] = ossFirst3

  // ── Confirmed registrations with non-null user_id ───────────────────────────

  const HERO_EMAILS = ['sowu.paul@gmail.com', 'paul@prezva.app']
  const SOWU_PAUL_SAUP_REG = '08000002-0001-4001-8001-000000000001'

  const { data: saupLoggedIn, error: saupLIErr } = await supabase
    .from('registrations')
    .select('id, user_id, attendee_email')
    .eq('event_id', saupId)
    .eq('status', 'confirmed')
    .not('user_id', 'is', null)
    .order('id')
  if (saupLIErr) throw new Error(`lookup SAUP logged-in regs: ${saupLIErr.message}`)

  const { data: ossLoggedIn, error: ossLIErr } = await supabase
    .from('registrations')
    .select('id, user_id, attendee_email')
    .eq('event_id', ossId)
    .eq('status', 'confirmed')
    .not('user_id', 'is', null)
    .order('id')
  if (ossLIErr) throw new Error(`lookup OSS logged-in regs: ${ossLIErr.message}`)

  const saupLoggedInRegs = (saupLoggedIn ?? []) as RegRow[]
  const ossLoggedInRegs  = (ossLoggedIn  ?? []) as RegRow[]

  // User IDs for Q&A / chat (cycle if fewer than questions)
  const saupUserIds = saupLoggedInRegs.map(r => r.user_id as string)
  const ossUserIds  = ossLoggedInRegs.map(r => r.user_id as string)

  const uid = (arr: string[], i: number) => arr[i % arr.length]

  // ── Dry-run plan ────────────────────────────────────────────────────────────

  const s1Planned  = 7   // session video UPDATE rows
  const s2Planned  = 14 + 9 + 30 * 3  // 113 virtual attendance rows
  const s3Planned  = 8 + 5 + 6        // 19 session questions
  const s4Planned  = 12 + 8           // 20 community posts
  // profiles: sowu.paul (all confirmed events), paul@prezva.app (bsbw + oss-meetup),
  //           SAUP fixtures (non-hero), OSS fixtures (non-hero)
  const s5Planned  = -1               // computed after reg lookup
  const s6Planned  = -1               // computed after reg query
  const s7Planned  = 1                // push subscription

  if (dryRun) {
    log.dry(`update 7 sessions with video fields (Section 1)`)
    log.dry(`insert ${14} SAUP UCR virtual attendance + ${9} SAUP ETOD virtual attendance + ${90} OSS virtual attendance (Section 2)`)
    log.dry(`delete+insert ${8} SAUP UCR questions + ${5} SAUP ETOD questions + ${6} OSS keynote questions (Section 3)`)
    log.dry(`delete+insert ${12} SAUP UCR chat posts + ${8} OSS keynote chat posts (Section 4)`)
    log.dry(`upsert attendee_profiles for hero personas + ${saupLoggedInRegs.filter(r => !HERO_EMAILS.includes(r.attendee_email)).length} SAUP fixtures + ${ossLoggedInRegs.filter(r => !HERO_EMAILS.includes(r.attendee_email)).length} OSS fixtures (Section 5)`)
    log.dry(`update sms_opt_in/phone for bsbw (33%), saup (25%), oss (50%) confirmed regs (Section 6)`)
    log.dry(`upsert 1 push_subscription for sowu.paul on SAUP (Section 7)`)
    log.info('')
    log.ok('Dry-run complete — no writes made')
    return { stage: 'video-comms', planned: s1Planned + s2Planned + s3Planned + s4Planned + s7Planned, actual: 0, note: 'dry-run' }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 1 — Session video fields
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 1: session video fields')

  const videoUpdates: Array<{ id: string; fields: Record<string, unknown> }> = [
    {
      id: saupUCR.id,
      fields: {
        mux_stream_id: 'gkIFXQJ01eN01x6cSvEimFhKMYEdqXe9q4RBXkZ5y01zQ',
        mux_playback_id: 'FkT9W4UXlO4bpCMr02YXAaNHa02jw00yfFv02VJnv4sQoE',
        mux_asset_id: 'RJGkLP01X01TXmBdqXqVNHB8mI01RpPpMvqCqjpPiXiE00',
        mux_asset_playback_id: 'FkT9W4UXlO4bpCMr02YXAaNHa02jw00yfFv02VJnv4sQoE',
        recording_enabled: true,
        allow_rewatch: true,
      },
    },
    {
      id: saupETOD.id,
      fields: {
        mux_stream_id: 'bX9d01GJqXhN5k7mY02pL8vRtWzA3cF4eH6iJ0kM1nP2qS',
        mux_playback_id: 'Hm3nK7pQ9sT2vW5xY8zA1bC4dE6fG0hI3jL6mN9oP2qR5s',
        mux_asset_id: 'Xp4qR8sT2vW6xY0zA3bD7eF1gH5iJ9kL3mN7oP1qR5sT9v',
        mux_asset_playback_id: 'Hm3nK7pQ9sT2vW5xY8zA1bC4dE6fG0hI3jL6mN9oP2qR5s',
        recording_enabled: true,
        allow_rewatch: false,
      },
    },
    {
      id: saupFBC.id,
      fields: {
        mux_stream_id: 'Yq5rS9tU3vX7yZ1aB4cE8fG2hI6jK0lM4nO8pQ2rS6tU0v',
        recording_enabled: false,
      },
    },
    {
      id: saupCS.id,
      fields: {
        mux_asset_id: 'Zr6sT0uV4wX8yZ2aC5dF9gH3iJ7kL1mN5oP9qR3sT7uV1w',
        mux_asset_playback_id: 'Im4oL8pQ2sT6vW0xY4zA7bD1eF5gH9iJ3kM7nO1pQ5rS9t',
        simulive_scheduled_at: '2026-06-15T14:00:00+00:00',
        recording_enabled: true,
        allow_rewatch: true,
      },
    },
    {
      id: ossKeynote.id,
      fields: { livekit_room_name: 'oss-summit-keynote-2026' },
    },
    {
      id: ossRust.id,
      fields: {
        livekit_room_name: 'oss-summit-room-2',
        mux_stream_id: 'Ar7tU1vW5xY9zA3bC6dG0eH4iJ8kL2mN6oP0qR4sT8uV2w',
      },
    },
    {
      id: ossComm.id,
      fields: {
        mux_stream_id: 'Bs8uV2wX6yZ0aC4dE7fH1iJ5kL9mN3oP7qR1sT5uV9wX3y',
        mux_playback_id: 'Jn5pM9qR3tU7vW1xY5zA8bC2dF6gH0iJ4kN8oP2qR6tU0v',
        mux_asset_id: 'Ct9vW3xY7zA1bD5eF8gI2jK6lM0nO4pQ8rS2tU6vW0xY4z',
        mux_asset_playback_id: 'Jn5pM9qR3tU7vW1xY5zA8bC2dF6gH0iJ4kN8oP2qR6tU0v',
        recording_enabled: true,
        allow_rewatch: true,
      },
    },
  ]

  let s1Actual = 0
  for (const { id, fields } of videoUpdates) {
    const { error } = await supabase.from('sessions').update(fields).eq('id', id)
    if (error) throw new Error(`update session ${id}: ${error.message}`)
    s1Actual++
  }
  log.ok(`Section 1: ${s1Actual} sessions updated`)

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Virtual session_attendance rows
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 2: virtual session_attendance')

  // Helper: build virtual attendance rows for a session
  async function buildVirtualAttRows(
    sessionId: string,
    eventId: string,
    regsPool: string[], // registration IDs already filtered (no conflicts, no exclusions)
    groups: Array<{ count: number; watch_duration_seconds: number | null }>,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = []
    let offset = 0
    for (const g of groups) {
      const slice = regsPool.slice(offset, offset + g.count)
      for (const regId of slice) {
        rows.push({
          session_id: sessionId,
          registration_id: regId,
          event_id: eventId,
          source: 'virtual',
          watch_duration_seconds: g.watch_duration_seconds,
        })
      }
      offset += g.count
    }
    return rows
  }

  // Query all confirmed SAUP regs (including guest)
  const { data: saupAllRegs, error: saupAllErr } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', saupId)
    .eq('status', 'confirmed')
    .order('id')
  if (saupAllErr) throw new Error(`lookup all SAUP regs: ${saupAllErr.message}`)
  const saupAllRegIds = (saupAllRegs ?? []).map((r: { id: string }) => r.id)

  // Query all confirmed OSS regs
  const { data: ossAllRegs, error: ossAllErr } = await supabase
    .from('registrations')
    .select('id')
    .eq('event_id', ossId)
    .eq('status', 'confirmed')
    .order('id')
  if (ossAllErr) throw new Error(`lookup all OSS regs: ${ossAllErr.message}`)
  const ossAllRegIds = (ossAllRegs ?? []).map((r: { id: string }) => r.id)

  // Existing session_attendance reg IDs for each SAUP target session
  async function getExistingAttRegIds(sessionId: string): Promise<Set<string>> {
    const { data, error } = await supabase
      .from('session_attendance')
      .select('registration_id')
      .eq('session_id', sessionId)
    if (error) throw new Error(`lookup existing attendance ${sessionId}: ${error.message}`)
    return new Set((data ?? []).map((r: { registration_id: string }) => r.registration_id))
  }

  const existingUCR  = await getExistingAttRegIds(saupUCR.id)
  const existingETOD = await getExistingAttRegIds(saupETOD.id)

  // Filter pool: exclude existing + exclude sowu.paul's SAUP reg
  const ucrPool  = saupAllRegIds.filter(id => !existingUCR.has(id)  && id !== SOWU_PAUL_SAUP_REG)
  const etodPool = saupAllRegIds.filter(id => !existingETOD.has(id) && id !== SOWU_PAUL_SAUP_REG)

  // SAUP UCR: 8@3200 + 4@1800 + 2@null = 14
  const ucrRows = await buildVirtualAttRows(saupUCR.id, saupId, ucrPool, [
    { count: 8, watch_duration_seconds: 3200 },
    { count: 4, watch_duration_seconds: 1800 },
    { count: 2, watch_duration_seconds: null },
  ])

  // SAUP ETOD: 6@3000 + 3@900 = 9
  const etodRows = await buildVirtualAttRows(saupETOD.id, saupId, etodPool, [
    { count: 6, watch_duration_seconds: 3000 },
    { count: 3, watch_duration_seconds: 900 },
  ])

  // OSS first 3 sessions: 15@2000 + 10@3000 + 5@null = 30 each
  const ossKeyRows  = await buildVirtualAttRows(ossKeynote.id, ossId, ossAllRegIds, [
    { count: 15, watch_duration_seconds: 2000 },
    { count: 10, watch_duration_seconds: 3000 },
    { count: 5,  watch_duration_seconds: null },
  ])
  const ossRustRows = await buildVirtualAttRows(ossRust.id, ossId, ossAllRegIds, [
    { count: 15, watch_duration_seconds: 2000 },
    { count: 10, watch_duration_seconds: 3000 },
    { count: 5,  watch_duration_seconds: null },
  ])
  const ossCommRows = await buildVirtualAttRows(ossComm.id, ossId, ossAllRegIds, [
    { count: 15, watch_duration_seconds: 2000 },
    { count: 10, watch_duration_seconds: 3000 },
    { count: 5,  watch_duration_seconds: null },
  ])

  const allAttRows = [...ucrRows, ...etodRows, ...ossKeyRows, ...ossRustRows, ...ossCommRows]
  const s2Actual = await batchUpsert(supabase, 'session_attendance', allAttRows, 'session_id,registration_id')
  log.ok(`Section 2: ${s2Actual} virtual attendance rows (UCR=${ucrRows.length}, ETOD=${etodRows.length}, OSS×3=${ossKeyRows.length + ossRustRows.length + ossCommRows.length})`)

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 3 — session_questions
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 3: session_questions')

  const now = new Date().toISOString()
  const questionTargetSessions = [saupUCR.id, saupETOD.id, ossKeynote.id]

  // Delete existing questions for these sessions (no unique key → DELETE + INSERT for idempotency)
  for (const sid of questionTargetSessions) {
    const { error } = await supabase.from('session_questions').delete().eq('session_id', sid)
    if (error) throw new Error(`delete session_questions for ${sid}: ${error.message}`)
  }

  const questionRows: Record<string, unknown>[] = [
    // ── SAUP UCR (8 questions) ─────────────────────────────────────────────────
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 0), body: 'How does the 2024 climate resilience framework interact with existing zoning variances?', upvote_count: 5, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 1), body: 'What funding mechanisms are available for municipalities implementing green infrastructure retrofits?', upvote_count: 4, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 2), body: 'Can you clarify the difference between adaptation and mitigation strategies in the policy context?', upvote_count: 3, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 3), body: 'How do we handle legacy industrial sites under the new resilience standards?', upvote_count: 1, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 4), body: 'What is the timeline for the state-level implementation guidance?', upvote_count: 1, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 0), body: 'Are there model ordinances available for small municipalities?', upvote_count: 0, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 1), body: 'Which jurisdictions have successfully implemented the transit corridor overlay district?', upvote_count: 2, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: now, organizer_answer: 'Great question — the policy framework requires a 30% green coverage minimum under the 2024 amendment.' },
    { session_id: saupUCR.id, event_id: saupId, user_id: uid(saupUserIds, 2), body: 'How should we approach community engagement for climate adaptation plans?', upvote_count: 0, is_anonymous: true, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },

    // ── SAUP ETOD (5 questions) ────────────────────────────────────────────────
    { session_id: saupETOD.id, event_id: saupId, user_id: uid(saupUserIds, 0), body: 'How do anti-displacement policies interact with TOD zoning incentives?', upvote_count: 6, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupETOD.id, event_id: saupId, user_id: uid(saupUserIds, 1), body: 'What equity metrics should planners track for TOD project evaluation?', upvote_count: 2, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupETOD.id, event_id: saupId, user_id: uid(saupUserIds, 2), body: 'Where can we find the anti-displacement toolkit referenced in the presentation?', upvote_count: 1, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: now, organizer_answer: 'The anti-displacement toolkit is available at the state planning association website.' },
    { session_id: saupETOD.id, event_id: saupId, user_id: uid(saupUserIds, 3), body: 'How do you handle transit-area parking minimums under form-based code?', upvote_count: 0, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: saupETOD.id, event_id: saupId, user_id: uid(saupUserIds, 4), body: 'What public engagement strategies have been most effective near rail corridors?', upvote_count: 0, is_anonymous: true, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },

    // ── OSS Keynote (6 questions) ──────────────────────────────────────────────
    { session_id: ossKeynote.id, event_id: ossId, user_id: uid(ossUserIds, 0), body: 'What is your take on corporate open source contribution policies — net positive or reputation washing?', upvote_count: 8, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: ossKeynote.id, event_id: ossId, user_id: uid(ossUserIds, 1), body: 'How should maintainers handle burnout when a project has millions of dependents?', upvote_count: 5, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: ossKeynote.id, event_id: ossId, user_id: uid(ossUserIds, 2), body: 'Is WebAssembly actually going to replace native plugins in the next 5 years?', upvote_count: 3, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: ossKeynote.id, event_id: ossId, user_id: uid(ossUserIds, 3), body: 'What is the best license strategy for a project that wants VC funding but also community contributions?', upvote_count: 2, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: now, organizer_answer: null },
    { session_id: ossKeynote.id, event_id: ossId, user_id: uid(ossUserIds, 4), body: 'Can you share the methodology behind the contributor growth stats in the slides?', upvote_count: 1, is_anonymous: false, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
    { session_id: ossKeynote.id, event_id: ossId, user_id: uid(ossUserIds, 5), body: 'How do you think about governance for multi-stakeholder foundations like Apache?', upvote_count: 0, is_anonymous: true, is_poll: false, poll_options: [], is_hidden: false, is_pinned: false, answered_at: null, organizer_answer: null },
  ]

  const s3Actual = await batchInsert(supabase, 'session_questions', questionRows)
  log.ok(`Section 3: ${s3Actual} session questions`)

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 4 — community_posts with session_id
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 4: community_posts (session chat)')

  const postTargetSessions = [saupUCR.id, ossKeynote.id]
  for (const sid of postTargetSessions) {
    const { error } = await supabase.from('community_posts').delete().eq('session_id', sid)
    if (error) throw new Error(`delete community_posts for session ${sid}: ${error.message}`)
  }

  // SAUP UCR: 12 posts spread over 14:00–15:00 UTC 2026-05-29
  const saupWindow = { start: new Date('2026-05-29T14:00:00Z'), durationMs: 60 * 60 * 1000 }
  // OSS Keynote: 8 posts spread over 14:00–15:00 UTC 2026-08-20
  const ossWindow  = { start: new Date('2026-08-20T14:00:00Z'), durationMs: 60 * 60 * 1000 }

  function spreadTime(window: { start: Date; durationMs: number }, index: number, total: number): string {
    const ms = window.start.getTime() + Math.floor((index / total) * window.durationMs)
    return new Date(ms).toISOString()
  }

  const saupChatBodies = [
    'Great framing on the policy layers — this is exactly what our planning dept needs.',
    'Can you expand on the state pre-emption issue you mentioned?',
    'The Augusta case study is really relevant to what we\'re seeing regionally.',
    'Slide 7 has a typo but the content is solid',
    'Is the recording going to be available after?',
    'What\'s the citation for that 30% green coverage stat?',
    'This connects well to the session on TOD yesterday.',
    'Our municipality tried this approach — happy to share notes offline.',
    'Question submitted in the Q&A about the 2024 amendment.',
    'The funding mechanism table on slide 12 is really useful.',
    'Will the presenter share slides?',
    'Thanks for covering the equity lens — often gets skipped.',
  ]

  const ossChatBodies = [
    'Finally someone calling out the sustainability problem directly.',
    'The GitHub stats at the beginning are wild — didn\'t realize the growth curve.',
    'WebAssembly angle is interesting, wasn\'t expecting that in a keynote.',
    'Is the Rust adoption data from Stack Overflow survey or somewhere else?',
    'This would pair well with the WASM session tomorrow.',
    'Strong opener. Good energy.',
    'The maintainer burnout section hit close to home.',
    'Q: are slides being posted to the GitHub repo?',
  ]

  const postRows: Record<string, unknown>[] = []

  for (let i = 0; i < saupChatBodies.length; i++) {
    postRows.push({
      event_id: saupId,
      session_id: saupUCR.id,
      author_id: uid(saupUserIds, i),
      post_type: 'post',
      body: saupChatBodies[i],
      is_pinned: false,
      is_deleted: false,
      upvote_count: 0,
      reply_count: 0,
      rsvp_count: 0,
      created_at: spreadTime(saupWindow, i, saupChatBodies.length),
    })
  }

  for (let i = 0; i < ossChatBodies.length; i++) {
    postRows.push({
      event_id: ossId,
      session_id: ossKeynote.id,
      author_id: uid(ossUserIds, i),
      post_type: 'post',
      body: ossChatBodies[i],
      is_pinned: false,
      is_deleted: false,
      upvote_count: 0,
      reply_count: 0,
      rsvp_count: 0,
      created_at: spreadTime(ossWindow, i, ossChatBodies.length),
    })
  }

  const s4Actual = await batchInsert(supabase, 'community_posts', postRows)
  log.ok(`Section 4: ${s4Actual} community posts`)

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 5 — attendee_profiles
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 5: attendee_profiles')

  // Look up hero confirmed registrations across all events
  const { data: paulGmailRegs, error: pg1Err } = await supabase
    .from('registrations')
    .select('id, event_id')
    .eq('attendee_email', 'sowu.paul@gmail.com')
    .eq('status', 'confirmed')
  if (pg1Err) throw new Error(`lookup sowu.paul regs: ${pg1Err.message}`)

  const { data: paulPrezvaRegs, error: pg2Err } = await supabase
    .from('registrations')
    .select('id, event_id')
    .eq('attendee_email', 'paul@prezva.app')
    .eq('status', 'confirmed')
  if (pg2Err) throw new Error(`lookup paul@prezva.app regs: ${pg2Err.message}`)

  const SAUP_FIXTURE_PROFILES = [
    { job_title: 'Senior Urban Planner',          company: 'City of Atlanta Planning Dept',     interests: ['urban planning', 'zoning', 'transit'],                  bio: 'Senior planner at the City of Atlanta focused on equitable land use and transit-oriented development.' },
    { job_title: 'Transportation Policy Analyst', company: 'Georgia DOT',                       interests: ['transit', 'equity', 'climate policy'],                  bio: 'Policy analyst at Georgia DOT working on multimodal transportation equity and climate resilience.' },
    { job_title: 'Community Development Director',company: 'Fulton County',                     interests: ['housing', 'community engagement', 'policy'],             bio: 'Director of community development at Fulton County, leading housing and neighborhood revitalization initiatives.' },
    { job_title: 'Landscape Architect',           company: 'AECOM',                             interests: ['green infrastructure', 'resilience', 'design'],          bio: 'Landscape architect at AECOM specializing in green infrastructure and urban resilience design.' },
  ]

  const OSS_FIXTURE_PROFILES = [
    { job_title: 'Staff Engineer',       company: 'HashiCorp',                     interests: ['rust', 'distributed systems', 'open source'],          bio: 'Staff engineer at HashiCorp building distributed infrastructure tools in Rust and Go.' },
    { job_title: 'Open Source Lead',     company: 'Red Hat',                       interests: ['linux', 'kubernetes', 'open source governance'],        bio: 'Open source program lead at Red Hat, supporting upstream contributions across the Linux and Kubernetes ecosystems.' },
    { job_title: 'Platform Engineer',    company: 'Cloudflare',                    interests: ['wasm', 'edge computing', 'rust'],                       bio: 'Platform engineer at Cloudflare working on WebAssembly runtimes and edge compute infrastructure.' },
    { job_title: 'DevRel Engineer',      company: 'Vercel',                        interests: ['developer experience', 'open source', 'nextjs'],        bio: 'Developer relations engineer at Vercel focused on open source tooling and the Next.js ecosystem.' },
    { job_title: 'Security Researcher',  company: 'Trail of Bits',                 interests: ['zero-trust', 'open source', 'vulnerability research'],  bio: 'Security researcher at Trail of Bits specializing in open source vulnerability analysis and zero-trust architectures.' },
  ]

  const profileRows: Record<string, unknown>[] = []

  // sowu.paul@gmail.com — all confirmed registrations
  const PAUL_GMAIL_USER = '43280c9b-60a7-4884-94b0-1c80e5af1a9d'
  for (const reg of (paulGmailRegs ?? [])) {
    profileRows.push({
      registration_id: reg.id,
      event_id: reg.event_id,
      user_id: PAUL_GMAIL_USER,
      job_title: 'Founder, Prezva | Event Technology',
      bio: 'Building the future of event management. Interested in CE credits, urban planning, and open source.',
      company: '4S Logistics LLC',
      website_url: 'https://prezva.app',
      linkedin_url: 'https://linkedin.com/in/sowupaul',
      interests: ['event technology', 'urban planning', 'open source'],
      avatar_url: null,
      is_visible: true,
    })
  }

  // paul@prezva.app — confirmed registrations (bsbw + oss-meetup only)
  const PAUL_PREZVA_USER = '1394c607-be3f-4311-91e1-42ae1ecf622a'
  for (const reg of (paulPrezvaRegs ?? [])) {
    profileRows.push({
      registration_id: reg.id,
      event_id: reg.event_id,
      user_id: PAUL_PREZVA_USER,
      job_title: 'Product Lead, Prezva',
      bio: 'Working on the next generation of event tools. Testing features before they ship.',
      company: '4S Logistics LLC',
      website_url: 'https://prezva.app',
      interests: ['event technology', 'product management'],
      avatar_url: null,
      is_visible: true,
    })
  }

  // SAUP fixture accounts (non-hero, non-paul)
  const saupFixtureRegs = saupLoggedInRegs.filter(r => !HERO_EMAILS.includes(r.attendee_email))
  for (let i = 0; i < saupFixtureRegs.length; i++) {
    const reg = saupFixtureRegs[i]
    const profile = SAUP_FIXTURE_PROFILES[i % SAUP_FIXTURE_PROFILES.length]
    profileRows.push({
      registration_id: reg.id,
      event_id: saupId,
      user_id: reg.user_id,
      job_title: profile.job_title,
      company: profile.company,
      bio: profile.bio,
      interests: profile.interests,
      avatar_url: null,
      is_visible: true,
    })
  }

  // OSS fixture accounts (non-hero)
  const ossFixtureRegs = ossLoggedInRegs.filter(r => !HERO_EMAILS.includes(r.attendee_email))
  for (let i = 0; i < ossFixtureRegs.length; i++) {
    const reg = ossFixtureRegs[i]
    const profile = OSS_FIXTURE_PROFILES[i % OSS_FIXTURE_PROFILES.length]
    profileRows.push({
      registration_id: reg.id,
      event_id: ossId,
      user_id: reg.user_id,
      job_title: profile.job_title,
      company: profile.company,
      bio: profile.bio,
      interests: profile.interests,
      avatar_url: null,
      is_visible: true,
    })
  }

  const s5Actual = await batchUpsert(supabase, 'attendee_profiles', profileRows, 'registration_id')
  log.ok(`Section 5: ${s5Actual} attendee_profiles (paul.gmail×${(paulGmailRegs ?? []).length}, paul.prezva×${(paulPrezvaRegs ?? []).length}, saup-fixtures×${saupFixtureRegs.length}, oss-fixtures×${ossFixtureRegs.length})`)

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 6 — sms_opt_in / attendee_phone
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 6: SMS opt-in / attendee_phone')

  const smsEvents: Array<{ slug: string; eventId: string; modN: number }> = [
    { slug: 'bsbw-2026',                   eventId: bsbwId,  modN: 3 },
    { slug: 'saup-ce-conference-2026',      eventId: saupId,  modN: 4 },
    { slug: 'oss-atl-virtual-summit-2026',  eventId: ossId,   modN: 2 },
  ]

  let s6Actual = 0
  for (const evt of smsEvents) {
    const { data: confirmedRegs, error: crErr } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', evt.eventId)
      .eq('status', 'confirmed')
      .order('id')
    if (crErr) throw new Error(`lookup confirmed regs for ${evt.slug}: ${crErr.message}`)

    const toUpdate = (confirmedRegs ?? [])
      .map((r: { id: string }, i: number) => ({ i, id: r.id }))
      .filter(({ i }) => i % evt.modN === 0)
      .map(({ id }) => ({
        id,
        attendee_phone: '+1770555' + String(djb2Hash(id) % 10000).padStart(4, '0'),
      }))

    const count = await batchUpdateSMS(supabase, toUpdate)
    s6Actual += count
    log.ok(`  ${evt.slug}: ${count} registrations opted in`)
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SECTION 7 — push_subscriptions
  // ══════════════════════════════════════════════════════════════════════════════

  log.info('Section 7: push_subscriptions')

  const pushRows: Record<string, unknown>[] = [
    {
      registration_id: '08000002-0001-4001-8001-000000000001', // sowu.paul SAUP reg
      endpoint: 'https://updates.push.services.mozilla.com/push/v1/test-prezva-sowu-paul-saup',
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtZ6B4D6Q8cYVX4MIBQ7EYgAbqUGFThBuMGFE6Ky',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  ]

  const s7Actual = await batchUpsert(supabase, 'push_subscriptions', pushRows, 'endpoint')
  log.ok(`Section 7: ${s7Actual} push_subscriptions`)

  // ── Final totals ────────────────────────────────────────────────────────────

  const totalActual = s1Actual + s2Actual + s3Actual + s4Actual + s5Actual + s6Actual + s7Actual
  log.ok(`Stage 08 complete — ${totalActual} total rows written/updated`)
  log.info(`  S1 session video updates: ${s1Actual}`)
  log.info(`  S2 virtual attendance:    ${s2Actual}`)
  log.info(`  S3 session questions:     ${s3Actual}`)
  log.info(`  S4 community posts:       ${s4Actual}`)
  log.info(`  S5 attendee profiles:     ${s5Actual}`)
  log.info(`  S6 SMS updates:           ${s6Actual}`)
  log.info(`  S7 push subscriptions:    ${s7Actual}`)

  return {
    stage: 'video-comms',
    planned: totalActual,
    actual: totalActual,
  }
}
