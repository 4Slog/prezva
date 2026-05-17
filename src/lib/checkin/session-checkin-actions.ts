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

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('registration_id', reg.id)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (existing) return { ok: true, alreadyMarked: true }

  const { error } = await supabase
    .from('check_ins')
    .insert({
      registration_id: reg.id,
      event_id: eventId,
      session_id: sessionId,
      user_id: user.id,
      method: 'self',
    })

  if (error) return { error: error.message }

  try {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints(eventId, user.id, 'session_attend')
  } catch { /* non-fatal */ }

  return { ok: true, alreadyMarked: false }
}
