import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { VolunteerPortalClient } from './portal-client'

type Props = { params: Promise<{ token: string }> }

export default async function VolunteerPortalPage({ params }: Props) {
  const { token } = await params

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

  const { data: volExtra } = await admin
    .from('volunteers')
    .select('shift_response, shift_response_at, shift_decline_reason')
    .eq('id', volunteer.id)
    .maybeSingle()

  const assignedSessionIds: string[] = (volunteer.assigned_sessions ?? []) as string[]
  let assignedSessions: AssignedSession[] = []
  if (assignedSessionIds.length > 0) {
    const { data: sessions } = await admin
      .from('sessions')
      .select('id, title, starts_at, ends_at, type, rooms(name)')
      .in('id', assignedSessionIds)
      .order('starts_at', { ascending: true })
    assignedSessions = (sessions ?? []) as unknown as AssignedSession[]
  }

  return (
    <VolunteerPortalClient
      volunteer={{ ...volunteer, ...(volExtra ?? {}) } as any}
      event={event as any}
      token={token}
      assignedSessions={assignedSessions}
    />
  )
}

export interface AssignedSession {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  type: string | null
  rooms: { name: string }[] | { name: string } | null
}
