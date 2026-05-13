import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { VolunteerPortalClient } from './portal-client'

type Props = { params: Promise<{ token: string }> }

export default async function VolunteerPortalPage({ params }: Props) {
  const { token } = await params

  // Admin client: look up volunteer by token (no auth required for portal access)
  const admin = createAdminClient()
  const { data: volunteer } = await admin
    .rpc('get_volunteer_by_token', { p_token: token })

  if (!volunteer) notFound()

  const { data: event } = await admin
    .from('events')
    .select('id, title, slug, start_at, end_at, timezone, venue_name, venue_city')
    .eq('id', volunteer.event_id)
    .maybeSingle()

  if (!event) notFound()

  return (
    <VolunteerPortalClient
      volunteer={volunteer as any}
      event={event as any}
      token={token}
    />
  )
}
