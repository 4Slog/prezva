import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAttendees } from '@/lib/embedded/attendees-actions'
import { EmbedAttendeesClient } from './client'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedAttendeesPage({ params }: Props) {
  const { eventId } = await params
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) redirect('/embedded/events')

  let orgId: string
  try {
    const session = await verifyEmbeddedSession(token)
    const db = createAdminClient()
    const { data: link } = await db
      .from('ghl_location_links')
      .select('org_id')
      .eq('ghl_location_id', session.location_id)
      .maybeSingle()
    if (!link) redirect('/embedded/events')
    orgId = link.org_id
  } catch {
    redirect('/embedded/events')
  }

  const db = createAdminClient()
  const [eventResult, ticketsResult] = await Promise.all([
    db
      .from('events')
      .select('id, title, org_id')
      .eq('id', eventId)
      .eq('org_id', orgId)
      .maybeSingle(),
    db
      .from('ticket_types')
      .select('id, name, price_cents')
      .eq('event_id', eventId)
      .eq('is_active', true),
  ])

  if (!eventResult.data) redirect('/embedded/events')

  const initialData = await getAttendees(eventId, { pageSize: 50 })

  return (
    <div className="p-6">
      <div className="mb-4">
        <a
          href="/embedded/events"
          className="text-xs"
          style={{ color: 'var(--pz-muted)' }}
        >
          ← Events
        </a>
      </div>
      <EmbedAttendeesClient
        eventId={eventId}
        eventName={(eventResult.data as any).title}
        initialData={initialData}
        tickets={(ticketsResult.data ?? []) as { id: string; name: string; price_cents?: number | null }[]}
      />
    </div>
  )
}
