import type { SupabaseClient } from '@supabase/supabase-js'

// F-R6: how many PUBLISHED sessions an event has — the same set eligibility
// counts. Returns null on a read error so the caller shows nothing rather than
// a wrong warning; the error is logged.
export async function countPublishedSessions(db: SupabaseClient, eventId: string): Promise<number | null> {
  const { count, error } = await db
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('is_published', true)
  if (error) {
    console.error('[certificates] published session count failed:', eventId, error.message)
    return null
  }
  return count ?? 0
}
