import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { EmbeddedEventCard } from '@/app/embedded/_components/embedded-event-card'

interface Props {
  searchParams: Promise<{
    location_id?: string
    user_email?: string
    location_name?: string
    k?: string
  }>
}


export default async function EmbeddedEventsPage({ searchParams }: Props) {
  const params = await searchParams
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value

  if (token) {
    try {
      const session = await verifyEmbeddedSession(token)
      const db = createAdminClient()

      // Resolve location -> org mapping (service-role; RLS bypassed — every query hand-scoped by id)
      const { data: link } = await db
        .from('ghl_location_links')
        .select('org_id')
        .eq('ghl_location_id', session.location_id)
        .maybeSingle()

      if (!link) {
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-base font-medium text-gray-700">
              This location isn&apos;t linked to an organization yet.
            </p>
            <p className="text-sm text-gray-400">
              Contact your administrator to complete the setup.
            </p>
          </div>
        )
      }

      const orgId = link.org_id

      // Fetch org name and events in parallel — both scoped strictly to orgId
      const [{ data: org }, { data: events }] = await Promise.all([
        db.from('organizations').select('name').eq('id', orgId).maybeSingle(),
        db
          .from('events')
          .select('id, title, slug, start_at, end_at, status, event_type, venue_name, venue_city, venue_state, capacity, registration_count')
          .eq('org_id', orgId)
          .order('start_at', { ascending: false }),
      ])

      // Fetch ticket types scoped to this org's event ids only — never global
      const eventIds = (events ?? []).map(e => e.id)
      const { data: ticketTypes } = eventIds.length > 0
        ? await db
            .from('ticket_types')
            .select('event_id, name, type, price_cents, currency, quantity, quantity_sold')
            .in('event_id', eventIds)
            .eq('is_visible', true)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })
        : { data: [] }

      // Group ticket types by event id
      const ticketsByEvent = new Map<string, typeof ticketTypes>()
      for (const tt of ticketTypes ?? []) {
        const list = ticketsByEvent.get(tt.event_id) ?? []
        list.push(tt)
        ticketsByEvent.set(tt.event_id, list)
      }

      return (
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--pz-text)' }}>
                {org?.name ?? 'Events'}
              </h1>
              <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Events</p>
            </div>
            <a
              href="/embedded/events/new"
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5z" />
              </svg>
              Create event
            </a>
          </div>

          {(!events || events.length === 0) ? (
            <div
              className="flex flex-col items-center justify-center rounded-xl border border-dashed p-10 text-center"
              style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface-2)' }}
            >
              <p className="text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>No events yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--pz-muted)' }}>
                Create your first event to get started.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {events.map(event => (
                <EmbeddedEventCard
                  key={event.id}
                  event={event}
                  tickets={ticketsByEvent.get(event.id) ?? []}
                />
              ))}
            </div>
          )}
        </div>
      )
    } catch {
      // Token invalid or expired — fall through to launch redirect or no-context UI
    }
  }

  // No session, but launch params present: send through the launch flow.
  if (params.location_id) {
    const launchUrl = new URL('/api/embedded/launch', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    launchUrl.searchParams.set('location_id', params.location_id)
    if (params.user_email) launchUrl.searchParams.set('user_email', params.user_email)
    if (params.location_name) launchUrl.searchParams.set('location_name', params.location_name)
    if (params.k) launchUrl.searchParams.set('k', params.k)
    redirect(launchUrl.pathname + launchUrl.search)
  }

  // No session, no params: neutral no-context placeholder
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-base font-medium text-gray-700">
        Open this from inside GoHighLevel
      </p>
      <p className="text-sm text-gray-400">
        This page is only accessible as an embedded app within your GHL account.
      </p>
    </div>
  )
}
