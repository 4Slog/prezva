import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { EventSettingsForm } from './settings-form'

interface Props {
  params: Promise<{ eventId: string }>
}

export default async function EmbedEventSettingsPage({ params }: Props) {
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
  const { data: event } = await db
    .from('events')
    .select('id, title, description, event_type, timezone, start_at, end_at, venue_name, venue_address, venue_city, venue_state, virtual_url, capacity, waitlist_enabled')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!event) redirect('/embedded/events')

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <a
          href={`/embedded/events/${eventId}`}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:opacity-75"
          style={{ color: 'var(--pz-muted)', background: 'var(--pz-surface-2)' }}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.78 12.78a.75.75 0 0 1-1.06 0L4.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 1.06L6.06 8l3.72 3.72a.75.75 0 0 1 0 1.06z" />
          </svg>
          Overview
        </a>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span className="text-xs font-medium" style={{ color: 'var(--pz-text)' }}>Event settings</span>
      </div>

      <div className="flex flex-col gap-0.5">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--pz-text)' }}>
          Event settings
        </h1>
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          Edit event details.
        </p>
      </div>

      <EventSettingsForm eventId={eventId} event={event} />
    </div>
  )
}
