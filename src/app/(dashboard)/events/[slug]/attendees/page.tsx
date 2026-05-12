import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getAttendees } from '@/lib/attendees/actions'
import { AttendeesClient } from './client'

interface Props { params: Promise<{ slug: string }> }

export default async function AttendeesPage({ params }: Props) {
  const { slug } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, org_id')
    .eq('slug', slug)
    .single()
  if (!event) notFound()

  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .single()
  if (!member) notFound()

  const [initialData, ticketsResult, integrationsResult] = await Promise.all([
    getAttendees((event as any).id),
    supabase.from('ticket_types').select('id, name, price_cents').eq('event_id', (event as any).id).eq('is_active', true),
    supabase.from('org_integrations').select('provider, status').eq('org_id', (event as any).org_id).in('provider', ['mailchimp', 'constant_contact', 'eventbrite']),
  ])

  const connectedProviders = new Set((integrationsResult.data ?? []).filter(i => i.status === 'connected').map(i => i.provider))

  return (
    <div className="max-w-6xl mx-auto p-6">
      <AttendeesClient
        eventId={(event as any).id}
        eventSlug={slug}
        eventName={(event as any).title}
        orgId={(event as any).org_id}
        initialData={initialData}
        tickets={(ticketsResult.data ?? []) as { id: string; name: string; price_cents?: number }[]}
        integrations={{ mailchimp: connectedProviders.has('mailchimp'), constant_contact: connectedProviders.has('constant_contact'), eventbrite: connectedProviders.has('eventbrite') }}
      />
    </div>
  )
}
