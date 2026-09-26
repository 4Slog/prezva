import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

// F-R4: a session with check-ins cannot be deleted — its check-ins are
// attendance/CE proof, and 0159 (check_ins.session_id ON DELETE NO ACTION)
// refuses the delete in the database as a backstop. Both doors (dashboard and
// embedded) check first so the organizer gets guidance instead of 23503.
//
// Not a server action: callers have authorized the event before calling. The
// db passed in must be able to see every check-in for the session (the service
// role), otherwise an RLS-hidden row would let the pre-check pass — the FK
// would still refuse, and deleteSessionGuarded maps that to the same message.

export const SESSION_HAS_CHECKINS_ERROR = 'This session has check-ins — unpublish it instead.'

export async function deleteSessionGuarded(
  db: SupabaseClient,
  checkinsDb: SupabaseClient,
  eventId: string,
  sessionId: string,
): Promise<{ error: string } | { success: true }> {
  // Attendance proof is a staff scan (check_ins) OR a self-marked / virtual
  // attendance row (session_attendance, which eligibility also counts and which
  // cascades away with the session). Either one blocks the delete.
  const [checkins, attendance] = await Promise.all([
    checkinsDb.from('check_ins').select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId).eq('event_id', eventId),
    checkinsDb.from('session_attendance').select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId),
  ])
  const countErr = checkins.error ?? attendance.error
  if (countErr) return { error: `Could not check this session's check-ins: ${countErr.message}` }
  if ((checkins.count ?? 0) > 0 || (attendance.count ?? 0) > 0) return { error: SESSION_HAS_CHECKINS_ERROR }

  // .select('id'): an RLS-filtered delete (a member without event.manage)
  // matches nothing and returns no error; that must not read as success.
  const { data, error } = await db
    .from('sessions').delete().eq('id', sessionId).eq('event_id', eventId).select('id')
  if (error) {
    // 23503 foreign_key_violation: a check-in landed between the count and the delete.
    if (error.code === '23503') return { error: SESSION_HAS_CHECKINS_ERROR }
    return { error: error.message }
  }
  if (!data || data.length === 0) return { error: 'Session not found, or you do not have permission to delete it.' }
  return { success: true }
}
