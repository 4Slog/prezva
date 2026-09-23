import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SessionIdentity } from '@/lib/auth/session-identity'

// The one ownership rule for "which registration is the caller's for this event"
// (extracted from /my-qr, GE-6b). Server-only helper, deliberately NOT a
// 'use server' export: callers must first establish identity via getSessionIdentity.
//   full auth   → the confirmed reg linked by user_id, else the confirmed reg whose
//                 attendee_email is the caller's verified auth email (lower-cased;
//                 registrations.user_id is not reliably populated)
//   claim-level → the pz_reg_ registration, only when it belongs to this event
//   anonymous   → null
// Always requires status 'confirmed'. The anonymous email+PIN path is NOT here:
// it stays with /my-qr, which owns that credential check.
export async function resolveOwnedRegistration<T extends { id: string } = { id: string }>(
  identity: SessionIdentity,
  eventId: string,
  columns = 'id',
): Promise<T | null> {
  const admin = createAdminClient()

  if (identity.type === 'user') {
    const { data: byUid } = await admin
      .from('registrations')
      .select(columns)
      .eq('event_id', eventId)
      .eq('user_id', identity.userId)
      .eq('status', 'confirmed')
      .maybeSingle()
    if (byUid) return byUid as unknown as T

    const sessionClient = await createClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    const userEmail = user?.email?.toLowerCase()
    if (!userEmail) return null
    const { data: byEmail } = await admin
      .from('registrations')
      .select(columns)
      .eq('event_id', eventId)
      .eq('attendee_email', userEmail)
      .eq('status', 'confirmed')
      .maybeSingle()
    return (byEmail as unknown as T | null) ?? null
  }

  if (identity.type === 'registration' && identity.eventId === eventId) {
    const { data } = await admin
      .from('registrations')
      .select(columns)
      .eq('id', identity.registrationId)
      .eq('status', 'confirmed')
      .maybeSingle()
    return (data as unknown as T | null) ?? null
  }

  return null
}
