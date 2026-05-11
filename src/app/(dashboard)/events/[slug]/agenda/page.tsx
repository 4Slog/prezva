import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getAgenda } from '@/lib/agenda/actions'
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

  const { sessions, tracks, rooms, speakers } = await getAgenda((event as any).id)

  const { data: ticketTypes } = await supabase
    .from('ticket_types')
    .select('id, name')
    .eq('event_id', (event as any).id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (
    <div className="p-6">
      <AgendaClient
        eventId={(event as any).id}
        timezone={(event as any).timezone ?? 'UTC'}
        initialSessions={sessions}
        tracks={tracks}
        rooms={rooms}
        speakers={speakers}
        ticketTypes={ticketTypes ?? []}
      />
    </div>
  )
}
