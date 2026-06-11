import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getAgenda, getOrgSessionTypes } from '@/lib/agenda/actions'
import { getSponsors } from '@/lib/sponsors/actions'
import { AgendaClient } from './client'

interface Props { params: Promise<{ slug: string }> }

export default async function AgendaPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events').select('id, title, org_id, timezone').eq('slug', slug).single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', user.id).single()
  if (!member) notFound()

  const [{ sessions, tracks, rooms, speakers }, sponsors, customTypes] = await Promise.all([
    getAgenda((event as any).id),
    getSponsors((event as any).id),
    getOrgSessionTypes((event as any).org_id),
  ])

  const { data: integrations } = await supabase
    .from('org_integrations')
    .select('provider, status')
    .eq('org_id', (event as any).org_id)
    .in('provider', ['zoom', 'teams'])

  const integrationMap: Record<string, string> = {}
  for (const row of integrations ?? []) integrationMap[row.provider] = row.status

  return (
    <div className="p-6">
      <AgendaClient
        eventId={(event as any).id}
        orgId={(event as any).org_id}
        timezone={(event as any).timezone ?? 'UTC'}
        initialSessions={sessions}
        tracks={tracks}
        rooms={rooms}
        speakers={speakers}
        sponsors={sponsors as any}
        zoomConnected={integrationMap['zoom'] === 'connected'}
        teamsConnected={integrationMap['teams'] === 'connected'}
        customTypes={customTypes}
      />
    </div>
  )
}
