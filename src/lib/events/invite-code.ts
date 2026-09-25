import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// O147: events.registration_invite_code is service-only (0158). Every reader
// goes through here, after its own authorization check (or, for registration,
// after loading the event row through RLS). Blank codes count as none.
export async function readEventInviteCode(eventId: string): Promise<{ code: string | null } | { error: string }> {
  const { data, error } = await createAdminClient()
    .from('events')
    .select('registration_invite_code')
    .eq('id', eventId)
    .maybeSingle()
  if (error) return { error: error.message }
  return { code: data?.registration_invite_code?.trim() || null }
}
