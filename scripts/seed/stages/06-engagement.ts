/**
 * Stage 06 — Engagement
 *
 * Seeds check_ins, session_attendance, leaderboard_points, and attendee_points
 * for events that have engagement data.
 *
 * TRIGGER NOTE:
 *   trg_checkin_count (AFTER INSERT on check_ins WHERE session_id IS NULL) auto-increments
 *   events.checked_in_count. DO NOT manually update that counter.
 *
 * UNIQUE CONSTRAINTS:
 *   check_ins: UNIQUE(registration_id, session_id) — PostgreSQL allows two (reg, NULL) rows;
 *     seed enforces one event-level check-in per registration by construction (no upsert).
 *   session_attendance: UNIQUE(session_id, registration_id) — upsert DO NOTHING safe.
 *   leaderboard_points: partial UNIQUE(event_id, user_id, action) WHERE action IN
 *     ('checkin','profile_complete','session_attend') — ONE row per user per event per action.
 *   attendee_points: UNIQUE(user_id, event_id).
 *
 * Batch limit: ≤200 rows per supabase call.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventsFileData, EventDef, SessionDef } from '../lib/event-types'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface B6005Groups {
  group_a: number
  group_b: number
  group_c: number
}

export interface EngagementEventDef {
  slug: string
  confirmed: number
  logged_in_count: number
  event_checkin_rate: number
  session_checkin_rates?: Record<string, number>
  default_session_rate?: number
  sessions_occurred?: number
  b6005_groups?: B6005Groups
  leaderboard_enabled: boolean
  checkin_points?: number
  session_attend_points?: number
}

export interface EngagementFileData {
  events: EngagementEventDef[]
}

// ─── LCG seeded RNG ───────────────────────────────────────────────────────────

function djb2Hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) & 0xffffffff
  return h >>> 0
}

class Lcg {
  private s: number
  constructor(seed: number) { this.s = seed >>> 0 }
  next(): number {
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0
    return this.s
  }
  float(): number { return this.next() / 0x100000000 }
}

// ─── Planned count helpers (dry-run, no DB) ───────────────────────────────────

interface PlannedCounts {
  event_checkins: number
  session_checkins: number
  session_attendance: number
  leaderboard_points: number
  attendee_points: number
}

function planCounts(er: EngagementEventDef, eventDef: EventDef): PlannedCounts {
  const eventCheckins = Math.floor(er.confirmed * er.event_checkin_rate)

  let sessionCheckins = 0
  let sessionAttendance = 0

  if (er.b6005_groups) {
    // SAUP B6-005 logic
    const n_a = Math.floor(eventCheckins * er.b6005_groups.group_a)
    const n_c = Math.floor(eventCheckins * er.b6005_groups.group_c)
    const n_b = Math.floor(eventCheckins * er.b6005_groups.group_b)
    const occ = er.sessions_occurred ?? 0
    sessionCheckins = (n_a + n_c) * occ
    sessionAttendance = (n_b + n_c) * occ
  } else {
    // Standard: sample each session by type rate
    for (const sn of eventDef.sessions ?? []) {
      const rate = (er.session_checkin_rates ?? {})[sn.session_type ?? ''] ?? (er.default_session_rate ?? 0)
      sessionCheckins += Math.floor(eventCheckins * rate)
    }
  }

  // leaderboard: ONE checkin row + ONE session_attend row per logged-in user (if enabled)
  const leaderboardPoints = er.leaderboard_enabled ? er.logged_in_count * 2 : 0
  const attendeePoints    = er.leaderboard_enabled ? er.logged_in_count : 0

  return { event_checkins: eventCheckins, session_checkins: sessionCheckins, session_attendance: sessionAttendance, leaderboard_points: leaderboardPoints, attendee_points: attendeePoints }
}

// ─── Batch helpers ────────────────────────────────────────────────────────────

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

// ─── Registration row type (from DB query) ────────────────────────────────────

interface RegRow { registration_id: string; user_id: string | null }

// ─── Main exported function ───────────────────────────────────────────────────

export async function runEngagement(
  supabase: SupabaseClient,
  engData: EngagementFileData,
  eventsData: EventsFileData,
  opts: { dryRun: boolean },
): Promise<StageSummary> {
  log.section('Stage 06: Engagement (check-ins, session attendance, leaderboard)')

  const eventMap = new Map(eventsData.events.map(e => [e.slug, e]))

  // ── Dry-run: planned counts ────────────────────────────────────────────────
  let totalPlanned = 0
  const dryLines: string[] = []

  for (const er of engData.events) {
    const eventDef = eventMap.get(er.slug)
    if (!eventDef) { log.warn(`event "${er.slug}" not found in events.json — skipping`); continue }
    const c = planCounts(er, eventDef)
    const total = c.event_checkins + c.session_checkins + c.session_attendance + c.leaderboard_points + c.attendee_points
    totalPlanned += total
    dryLines.push(
      `event "${er.slug}": ` +
      `event_checkins=${c.event_checkins}, session_checkins=${c.session_checkins}, ` +
      `session_attendance=${c.session_attendance}, leaderboard_points=~${c.leaderboard_points}, ` +
      `attendee_points=~${c.attendee_points}  (total ~${total})`
    )
  }

  log.info(`Plan: ~${totalPlanned} rows across ${engData.events.length} events`)

  if (opts.dryRun) {
    for (const line of dryLines) log.dry(line)
    log.info('')
    log.ok('Dry-run complete — no writes made')
    return { stage: 'engagement', planned: totalPlanned, actual: 0, note: 'dry-run' }
  }

  // ── Execute mode ───────────────────────────────────────────────────────────
  let totalActual = 0

  for (const er of engData.events) {
    const eventDef = eventMap.get(er.slug)
    if (!eventDef) { log.warn(`event "${er.slug}" not in events.json — skipping`); continue }

    console.log(`\n  \x1b[1m▸ ${er.slug}\x1b[0m`)

    // 1. Query confirmed registrations sorted by id
    const { data: regData, error: regErr } = await supabase
      .from('registrations')
      .select('id, user_id')
      .eq('event_id', eventDef.id)
      .eq('status', 'confirmed')
      .order('id')
    if (regErr) throw new Error(`query confirmed regs for "${er.slug}": ${regErr.message}`)

    const regs: RegRow[] = (regData ?? []).map((r: Record<string, unknown>) => ({
      registration_id: r.id as string,
      user_id: r.user_id as string | null,
    }))

    // 2. Seed RNG and sample event check-ins
    const rng = new Lcg(djb2Hash(er.slug + ':eng'))
    const eventCheckins = regs.filter(() => rng.float() < er.event_checkin_rate)

    // Checked-in-at timestamp: event start for ended/archived, now for live/published
    const isHistorical = eventDef.status === 'ended' || eventDef.status === 'archived'
    const checkedInAt = isHistorical ? new Date(eventDef.start_at).toISOString() : new Date().toISOString()

    // 3. Insert event-level check-ins (session_id=null, ONE per registration, no upsert)
    const eventCiRows = eventCheckins.map(r => ({
      event_id: eventDef.id,
      registration_id: r.registration_id,
      session_id: null,
      method: 'qr_scan',
      checked_in_at: checkedInAt,
    }))
    const evtCiActual = await batchInsert(supabase, 'check_ins', eventCiRows as Record<string, unknown>[])

    // Track per-user attended session ids for leaderboard
    const userSessions = new Map<string, Set<string>>()

    function trackSession(reg: RegRow, sessionId: string) {
      if (!reg.user_id) return
      if (!userSessions.has(reg.user_id)) userSessions.set(reg.user_id, new Set())
      userSessions.get(reg.user_id)!.add(sessionId)
    }

    let sessionCiActual = 0
    let sessionAttActual = 0

    if (er.b6005_groups) {
      // ── SAUP B6-005 scenario ──────────────────────────────────────────────
      const { group_a, group_b, group_c } = er.b6005_groups
      const n_a = Math.floor(eventCheckins.length * group_a)
      const n_b = Math.floor(eventCheckins.length * group_b)
      const n_c = Math.floor(eventCheckins.length * group_c)
      const groupA = eventCheckins.slice(0, n_a)
      const groupB = eventCheckins.slice(n_a, n_a + n_b)
      const groupC = eventCheckins.slice(n_a + n_b, n_a + n_b + n_c)

      const occ = er.sessions_occurred ?? 0
      const occurredSessions = (eventDef.sessions ?? []).slice(0, occ)

      // group_a + group_c → check_ins.session_id
      const sessionCiRows: Record<string, unknown>[] = []
      for (const sn of occurredSessions) {
        for (const reg of [...groupA, ...groupC]) {
          sessionCiRows.push({ event_id: eventDef.id, registration_id: reg.registration_id, session_id: sn.id, method: 'qr_scan', checked_in_at: checkedInAt })
          trackSession(reg, sn.id)
        }
      }
      sessionCiActual = await batchUpsert(supabase, 'check_ins', sessionCiRows, 'registration_id,session_id')

      // group_b + group_c → session_attendance
      const sessionAttRows: Record<string, unknown>[] = []
      for (const sn of occurredSessions) {
        for (const reg of [...groupB, ...groupC]) {
          sessionAttRows.push({ session_id: sn.id, registration_id: reg.registration_id, event_id: eventDef.id, checked_in_at: checkedInAt })
          trackSession(reg, sn.id)
        }
      }
      sessionAttActual = await batchUpsert(supabase, 'session_attendance', sessionAttRows, 'session_id,registration_id')

    } else {
      // ── Standard session check-ins by type rate ───────────────────────────
      const sessionCiRows: Record<string, unknown>[] = []
      for (const sn of eventDef.sessions ?? []) {
        const rate = (er.session_checkin_rates ?? {})[sn.session_type ?? ''] ?? (er.default_session_rate ?? 0)
        for (const reg of eventCheckins) {
          if (rng.float() < rate) {
            sessionCiRows.push({ event_id: eventDef.id, registration_id: reg.registration_id, session_id: sn.id, method: 'qr_scan', checked_in_at: checkedInAt })
            trackSession(reg, sn.id)
          }
        }
      }
      sessionCiActual = await batchUpsert(supabase, 'check_ins', sessionCiRows, 'registration_id,session_id')
    }

    // 6. Leaderboard points + attendee_points aggregate (logged-in users only)
    let lbActual = 0
    let apActual = 0

    if (er.leaderboard_enabled) {
      const checkinPts = er.checkin_points ?? 100
      const sessionPts = er.session_attend_points ?? 50

      const lbRows: Record<string, unknown>[] = []
      const apMap = new Map<string, number>() // user_id → total_points

      for (const reg of eventCheckins) {
        if (!reg.user_id) continue

        // ONE checkin row per user per event
        lbRows.push({ event_id: eventDef.id, user_id: reg.user_id, registration_id: reg.registration_id, action: 'checkin', points: checkinPts })

        const sessions = userSessions.get(reg.user_id)
        const sessionsCount = sessions?.size ?? 0
        let userPts = checkinPts

        // ONE session_attend row per user per event (total session points in a single row)
        if (sessionsCount > 0) {
          lbRows.push({ event_id: eventDef.id, user_id: reg.user_id, registration_id: reg.registration_id, action: 'session_attend', points: sessionsCount * sessionPts })
          userPts += sessionsCount * sessionPts
        }

        apMap.set(reg.user_id, (apMap.get(reg.user_id) ?? 0) + userPts)
      }

      // Insert leaderboard_points (upsert on conflict DO NOTHING — partial unique index)
      lbActual = await batchUpsert(supabase, 'leaderboard_points', lbRows, 'event_id,user_id,action')

      // Upsert attendee_points aggregate
      const apRows = [...apMap.entries()].map(([userId, pts]) => ({
        user_id: userId,
        event_id: eventDef.id,
        total_points: pts,
        last_updated: new Date().toISOString(),
      }))
      apActual = await batchUpsert(supabase, 'attendee_points', apRows, 'user_id,event_id')
    }

    const rowCount = evtCiActual + sessionCiActual + sessionAttActual + lbActual + apActual
    totalActual += rowCount
    log.ok(
      `event_checkins=${evtCiActual}, session_checkins=${sessionCiActual}, ` +
      `session_attendance=${sessionAttActual}, leaderboard_points=${lbActual}, attendee_points=${apActual}`
    )
  }

  log.ok(`Stage 06 complete — ${totalActual} total rows`)
  return { stage: 'engagement', planned: totalPlanned, actual: totalActual }
}
