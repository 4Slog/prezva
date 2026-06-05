import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { EventCard } from '@/components/events/EventCard'
import Link from 'next/link'

export const metadata = { title: 'Events' }

export default async function EventsPage() {
  const user = await requireUser()
  const supabase = await createClient()

  // Get all orgs the user belongs to
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(id, name, slug)')
    .eq('user_id', user.id)

  // Get all events across all orgs
  const orgIds = (memberships ?? []).map((m) => m.org_id)
  const { data: events } = orgIds.length
    ? await supabase
        .from('events')
        .select('id, title, slug, status, event_type, start_at, end_at, registration_count, checked_in_count, venue_city, venue_state, org_id')
        .in('org_id', orgIds)
        .order('start_at', { ascending: false })
    : { data: [] }

  const hasOrgs = (memberships ?? []).length > 0

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">Events</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">
            {events?.length ?? 0} event{events?.length !== 1 ? 's' : ''} across your organizations
          </p>
        </div>
        {hasOrgs && (
          <Link
            href="/events/new"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
          >
            + New event
          </Link>
        )}
      </div>

      {!hasOrgs && (
        <div className="pz-card p-8 text-center">
          <p className="text-lg font-semibold text-[var(--pz-text)] mb-2">No organizations yet</p>
          <p className="text-sm text-[var(--pz-muted)] mb-4">Create an organization first, then add events.</p>
          <Link
            href="/orgs/new"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
          >
            Create organization
          </Link>
        </div>
      )}

      {hasOrgs && (!events || events.length === 0) && (
        <div className="pz-card p-8 text-center">
          <p className="text-lg font-semibold text-[var(--pz-text)] mb-2">No events yet</p>
          <p className="text-sm text-[var(--pz-muted)] mb-4">
            Create your first event in under 2 minutes — add ticket types, a public page, and go live.
          </p>
          <Link
            href="/events/new"
            className="inline-block rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
          >
            Create your first event
          </Link>
        </div>
      )}

      {events && events.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </div>
  )
}
