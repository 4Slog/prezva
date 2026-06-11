import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { getCheckInStats } from '@/lib/checkin/actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { CheckInClient } from './client'

interface Props { params: Promise<{ slug: string }> }

export default async function CheckInPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title, slug, org_id').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const [initialStats, volunteersResult, permSet] = await Promise.all([
    getCheckInStats((event as any).id),
    // Admin client: read volunteer status for this event
    createAdminClient()
      .from('volunteers')
      .select('name, status, clocked_in_at, clocked_out_at')
      .eq('event_id', (event as any).id),
    getOrgPermissions((event as any).org_id, user.id),
  ])
  const permissions = Array.from(permSet)

  const volunteers = (volunteersResult.data ?? []) as {
    name: string
    status: string
    clocked_in_at: string | null
    clocked_out_at: string | null
  }[]

  const volunteerStatus = volunteers.length > 0 ? {
    total: volunteers.length,
    checked_in: volunteers.filter(v => v.status === 'checked_in').length,
    clocked_in_names: volunteers
      .filter(v => v.clocked_in_at && !v.clocked_out_at)
      .map(v => v.name.split(' ')[0]),
  } : null

  const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  const eventSelfCheckInUrl = `${BASE_URL}/e/${slug}/self-checkin`

  return (
    <div className="p-6">
      <CheckInClient
        eventId={(event as any).id}
        eventName={(event as any).title}
        initialStats={initialStats}
        volunteerStatus={volunteerStatus}
        permissions={permissions}
        eventSelfCheckInUrl={eventSelfCheckInUrl}
      />
    </div>
  )
}
