import { createAdminClient } from '@/lib/supabase/admin'

export interface EligibilityResult {
  eligible: boolean
  reason?: string
  sessionsAttended: number
  sessionsTotal: number
  ceCredits: number
}

export async function checkEligibility(registrationId: string): Promise<EligibilityResult> {
  // Admin client: reads registration + event config + session check-ins across RLS
  const admin = createAdminClient()

  const { data: reg } = await admin
    .from('registrations')
    .select('id, status, event_id, events(certificate_enabled, certificate_min_session_attendance_pct)')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { eligible: false, reason: 'Registration not found', sessionsAttended: 0, sessionsTotal: 0, ceCredits: 0 }
  if (reg.status !== 'confirmed') return { eligible: false, reason: 'Registration not confirmed', sessionsAttended: 0, sessionsTotal: 0, ceCredits: 0 }

  const ev = reg.events as any
  if (!ev?.certificate_enabled) {
    return { eligible: false, reason: 'Certificates not enabled for this event', sessionsAttended: 0, sessionsTotal: 0, ceCredits: 0 }
  }

  const minPct = ev.certificate_min_session_attendance_pct ?? 60

  // B6-005 Phase 1: fetch sessions directly (not head-only) so we can map CE credit hours
  // without relying on FK join syntax that may not be declared for session_attendance.
  const [{ data: allSessions }, { data: checkins }, { data: selfAttended }] = await Promise.all([
    admin.from('sessions')
      .select('id, ce_credit_hours')
      .eq('event_id', reg.event_id)
      .eq('is_published', true),
    admin.from('check_ins')
      .select('session_id')
      .eq('registration_id', registrationId)
      .not('session_id', 'is', null),
    // Phase 1: in-person self-check-ins via session_attendance
    // Phase 2 (video build): add .gte('watch_duration_pct', threshold) for virtual attendance
    admin.from('session_attendance')
      .select('session_id')
      .eq('registration_id', registrationId),
  ])

  const total = (allSessions ?? []).length
  const creditMap = new Map<string, number>(
    (allSessions ?? []).map((s: any) => [s.id, s.ce_credit_hours ?? 0])
  )

  // Union both paths — Set deduplicates (staff scan + self-mark on same session counts once)
  const attendedIds = new Set<string>([
    ...(checkins ?? []).map((c: any) => c.session_id as string),
    ...(selfAttended ?? []).map((s: any) => s.session_id as string),
  ].filter(Boolean))

  const attended = attendedIds.size
  const ceCredits = [...attendedIds].reduce((sum, id) => sum + (creditMap.get(id) ?? 0), 0)

  if (total === 0) {
    return { eligible: true, sessionsAttended: 0, sessionsTotal: 0, ceCredits: 0 }
  }

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
