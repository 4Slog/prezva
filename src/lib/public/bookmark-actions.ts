'use server'

import { createClient } from '@/lib/supabase/server'

export async function toggleBookmark(userId: string, eventId: string, sessionId: string) {
  const supabase = await createClient()
  void eventId
  const { data: existing } = await supabase
    .from('session_bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .maybeSingle()
  if (existing) {
    await supabase.from('session_bookmarks').delete().eq('id', existing.id)
    return 'removed'
  }
  await supabase.from('session_bookmarks').insert({ user_id: userId, session_id: sessionId })
  return 'added'
}
