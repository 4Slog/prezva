import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// O147: speakers.email is service-only (0158). Callers authorize first, then
// merge the emails into the rows RLS already showed them. Scoped to one event
// and to the given ids, so it can never widen what the caller sees.
export async function loadSpeakerEmails(eventId: string, speakerIds: string[]): Promise<Map<string, string | null>> {
  if (speakerIds.length === 0) return new Map()
  const { data, error } = await createAdminClient()
    .from('speakers')
    .select('id, email')
    .eq('event_id', eventId)
    .in('id', speakerIds)
  if (error) throw new Error(`Could not load speaker emails: ${error.message}`)
  return new Map((data ?? []).map(r => [r.id as string, (r.email as string | null) ?? null]))
}

export async function withSpeakerEmails<T extends { id: string }>(eventId: string, rows: T[]): Promise<Array<T & { email: string | null }>> {
  const emails = await loadSpeakerEmails(eventId, rows.map(r => r.id))
  return rows.map(r => ({ ...r, email: emails.get(r.id) ?? null }))
}
