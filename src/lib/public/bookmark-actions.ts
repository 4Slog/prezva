'use server'

import { createClient } from '@/lib/supabase/server'

// session_bookmarks is keyed (user_id, session_id) — there is no id column, so
// the old select('id') always failed, "remove" never happened and a second
// click hit the primary key (ignored) and still reported "added". Now: the
// user comes from the session only (never a client-sent id), the caller says
// which state they want (idempotent — a stale page cannot invert it), and the
// session must be one this user can see.
const FAILED = 'Could not update your bookmark. Please try again.'

export async function setBookmark(sessionId: string, bookmarked: boolean): Promise<{ bookmarked: boolean } | { error: string }> {
  if (typeof sessionId !== 'string' || !sessionId || typeof bookmarked !== 'boolean') return { error: 'Invalid session' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sign in to bookmark sessions' }

  if (!bookmarked) {
    const { error } = await supabase
      .from('session_bookmarks')
      .delete()
      .eq('user_id', user.id)
      .eq('session_id', sessionId)
    if (error) { console.error('[bookmark] delete failed', error.message); return { error: FAILED } }
    return { bookmarked: false }
  }

  // RLS on sessions shows only published sessions (or the organizer's own), so
  // a draft session id cannot be bookmarked and then read back via the .ics.
  const { data: session, error: sessionError } = await supabase
    .from('sessions').select('id').eq('id', sessionId).eq('is_published', true).maybeSingle()
  if (sessionError || !session) return { error: 'Session not found' }

  const { error } = await supabase
    .from('session_bookmarks')
    .insert({ user_id: user.id, session_id: sessionId })
  // Already bookmarked (another tab, a double click): that is the asked-for state.
  if (error && error.code !== '23505') { console.error('[bookmark] insert failed', error.message); return { error: FAILED } }
  return { bookmarked: true }
}
