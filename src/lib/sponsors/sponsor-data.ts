import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Server-only read for dashboard pages that have already checked org access.

export async function getSponsors(eventId: string) {
  // Admin client: read sponsors across RLS for org admin view
  const admin = createAdminClient()
  const { data } = await admin
    .from('event_sponsors')
    .select('*')
    .eq('event_id', eventId)
    .order('tier')
    .order('sort_order')
    .order('created_at')
  return data ?? []
}
