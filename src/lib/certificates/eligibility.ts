import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface EligibilityResult {
  eligible: boolean
  reason?: string
  sessionsAttended: number
  sessionsTotal: number
  ceCredits: number
}

const NONE = { sessionsAttended: 0, sessionsTotal: 0, ceCredits: 0 }

// Every query error THROWS (F-R5). A failed read must never fall through to a
// default that looks like "no sessions" or "no attendance": the zero-session
// branch below would then decide eligibility on a lie. Callers turn the throw
// into a surfaced error (issue-core returns { error }, the sweeps log it per
// registration, the live page shows no progress).
//
// `client`: Trigger.dev jobs pass their own admin client (src/trigger/lib/
// supabase-admin.ts, the repo rule for anything running under src/trigger/);
// Next.js callers omit it and get @/lib/supabase/admin.
export async function checkEligibility(
  registrationId: string,
  client?: SupabaseClient,
): Promise<EligibilityResult> {
  // Admin client: reads registration + event config + session check-ins across RLS
  const admin = client ?? createAdminClient()

  const { data: reg, error: regErr } = await admin
    .from('registrations')
    .select('id, status, event_id, events(certificate_enabled, certificate_min_session_attendance_pct)')
    .eq('id', registrationId)
    .maybeSingle()
  if (regErr) throw new Error(`eligibility: registration read failed: ${regErr.message}`)

  if (!reg) return { eligible: false, reason: 'Registration not found', ...NONE }
  if (reg.status !== 'confirmed') return { eligible: false, reason: 'Registration not confirmed', ...NONE }

  const ev = reg.events as { certificate_enabled?: boolean | null; certificate_min_session_attendance_pct?: number | null } | null
  if (!ev?.certificate_enabled) {
    return { eligible: false, reason: 'Certificates not enabled for this event', ...NONE }
  }

  const minPct = ev.certificate_min_session_attendance_pct ?? 60

  // B6-005 Phase 1: fetch sessions directly (not head-only) so we can map CE credit hours
  // without relying on FK join syntax that may not be declared for session_attendance.
  const [sessionsRes, checkinsRes, selfAttendedRes] = await Promise.all([
    admin.from('sessions')
      .select('id, ce_credit_hours, starts_at, ends_at')
      .eq('event_id', reg.event_id)
      .eq('is_published', true),
    admin.from('check_ins')
      .select('session_id')
      .eq('registration_id', registrationId)
      .not('session_id', 'is', null),
    // Phase 2 (video build): watch_duration_seconds null = in-person (always counts);
    // non-null = virtual, must be >= 80% of session duration.
    admin.from('session_attendance')
      .select('session_id, watch_duration_seconds')
      .eq('registration_id', registrationId),
  ])
  if (sessionsRes.error) throw new Error(`eligibility: sessions read failed: ${sessionsRes.error.message}`)
  if (checkinsRes.error) throw new Error(`eligibility: session check-ins read failed: ${checkinsRes.error.message}`)
  if (selfAttendedRes.error) throw new Error(`eligibility: session attendance read failed: ${selfAttendedRes.error.message}`)

  const allSessions = (sessionsRes.data ?? []) as { id: string; ce_credit_hours: number | null; starts_at: string | null; ends_at: string | null }[]
  const total = allSessions.length

  // F-R1: an event with no published sessions certifies attendance only. The
  // attendee must have been checked in at the door (a check_ins row with no
  // session). Door check-ins are only real because check_ins.session_id no
  // longer nulls out when a session is deleted (0159).
  if (total === 0) {
    const { data: door, error: doorErr } = await admin
      .from('check_ins')
      .select('id')
      .eq('registration_id', registrationId)
      .is('session_id', null)
      .limit(1)
    if (doorErr) throw new Error(`eligibility: door check-in read failed: ${doorErr.message}`)
    if (!door || door.length === 0) {
      return { eligible: false, reason: 'No check-in recorded for this event', ...NONE }
    }
    return { eligible: true, ...NONE }
  }

  const creditMap = new Map<string, number>(allSessions.map((s) => [s.id, Number(s.ce_credit_hours ?? 0)]))

  // Build session duration map from starts_at / ends_at
  const sessionDurationMap = new Map<string, number>(
    allSessions.map((s) => {
      if (!s.starts_at || !s.ends_at) return [s.id, 0]
      return [s.id, Math.max(0, (new Date(s.ends_at).getTime() - new Date(s.starts_at).getTime()) / 1000)]
    })
  )

  // Phase 2 filter: null watch_duration → in-person check-in, always counts.
  // Non-null → virtual; require watch_duration / session_duration >= 0.80.
  // Fail open when session duration is 0 or unknown (divide-by-zero guard).
  const selfAttended = ((selfAttendedRes.data ?? []) as { session_id: string; watch_duration_seconds: number | null }[]).filter((row) => {
    if (row.watch_duration_seconds === null || row.watch_duration_seconds === undefined) return true
    const dur = sessionDurationMap.get(row.session_id) ?? 0
    if (dur === 0) return true
    return row.watch_duration_seconds / dur >= 0.80
  })

  // Union both paths — Set deduplicates (staff scan + self-mark on same session counts once).
  // F-R5: only PUBLISHED sessions count toward attended, same set as the total.
  const attendedIds = new Set<string>(
    [
      ...((checkinsRes.data ?? []) as { session_id: string | null }[]).map((c) => c.session_id),
      ...selfAttended.map((s) => s.session_id),
    ].filter((id): id is string => !!id && creditMap.has(id))
  )

  const attended = attendedIds.size
  const ceCredits = [...attendedIds].reduce((sum, id) => sum + (creditMap.get(id) ?? 0), 0)

  const pct = (attended / total) * 100
  if (pct < minPct) {
    return {
      eligible: false,
      reason: `Attended ${attended}/${total} sessions (${Math.round(pct)}% — need ${minPct}%)`,
      sessionsAttended: attended,
      sessionsTotal: total,
      ceCredits,
    }
  }

  return { eligible: true, sessionsAttended: attended, sessionsTotal: total, ceCredits }
}
