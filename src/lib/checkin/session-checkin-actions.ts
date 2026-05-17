'use server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export async function markSessionAttendance(sessionId: string, eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, user_id')
    .eq('event_id', eventId)
    .eq('user_id', user.id)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (!reg) return { error: 'No confirmed registration found for this event' }

  // Also verify the session belongs to this event (security: prevent cross-event spoofing)
  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!session) return { error: 'Session not found for this event' }

  const { data: existing } = await supabase
    .from('session_attendance')
    .select('id')
    .eq('registration_id', reg.id)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (existing) return { ok: true, alreadyMarked: true }

  const { error } = await supabase
    .from('session_attendance')
    .insert({
      registration_id: reg.id,
      event_id: eventId,
      session_id: sessionId,
      checked_in_by: user.id,
    })

  if (error) return { error: error.message }

  try {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints(eventId, user.id, 'session_attend')
  } catch { /* non-fatal */ }

  return { ok: true, alreadyMarked: false }
}
