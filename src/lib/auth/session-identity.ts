import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export type SessionIdentity =
  | { type: 'user'; userId: string }
  | { type: 'registration'; registrationId: string; eventId: string; attendeeEmail?: string }
  | { type: 'anonymous' }

export async function getSessionIdentity(eventSlug?: string): Promise<SessionIdentity> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) return { type: 'user', userId: user.id }

  // Check cookie for reg token (set server-side on confirmation page)
  if (eventSlug) {
    const jar = await cookies()
    const regId = jar.get(`pz_reg_${eventSlug}`)?.value
    if (regId) {
      const admin = createAdminClient()
      const { data: reg } = await admin
        .from('registrations')
        .select('id, event_id, status, attendee_email')
        .eq('id', regId)
        .in('status', ['confirmed'])
        .maybeSingle()
      if (reg) return { type: 'registration', registrationId: reg.id, eventId: reg.event_id, attendeeEmail: reg.attendee_email ?? undefined }
    }
  }

  return { type: 'anonymous' }
}

export function isAuthenticated(identity: SessionIdentity): identity is Extract<SessionIdentity, { type: 'user' }> {
  return identity.type === 'user'
}

export function hasRegistration(identity: SessionIdentity): identity is Extract<SessionIdentity, { type: 'registration' }> {
  return identity.type === 'registration'
}
