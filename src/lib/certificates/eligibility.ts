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

  const [{ count: totalCount }, { data: checkins }] = await Promise.all([
    admin.from('sessions').select('*', { count: 'exact', head: true }).eq('event_id', reg.event_id).eq('is_published', true),
    admin.from('session_check_ins').select('session_id, sessions(ce_credit_hours)').eq('registration_id', registrationId),
  ])

  const total = totalCount ?? 0
  const attended = (checkins ?? []).length

  const ceCredits = (checkins ?? []).reduce((sum: number, c: any) => {
    return sum + (c.sessions?.ce_credit_hours ?? 0)
  }, 0)

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
