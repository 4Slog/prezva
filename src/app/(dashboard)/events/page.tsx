import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { EventCard } from '@/components/events/EventCard'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { resolveActiveOrgSlug } from '@/lib/auth/active-org'
import { isSuperAdmin } from '@/lib/admin/gate'

export const metadata = { title: 'Events' }

export default async function EventsPage() {
  const user = await requireUser()
  const supabase = await createClient()

  // Get all orgs the user belongs to
  const { data: memberships } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(id, name, slug)')
    .eq('user_id', user.id)

  const hasOrgs = (memberships ?? []).length > 0

  // Resolve active org — mirror dashboard priority order:
  // 1. pz_impersonate_org (super-admin override)
  // 2. pz_active_org cookie via resolveActiveOrgSlug
  // 3. memberships[0] fallback
  const cookieStore = await cookies()
  const impersonateCookie = cookieStore.get('pz_impersonate_org')?.value
  let impersonateOrg: { id: string; name: string; slug: string } | null = null
  if (impersonateCookie && isSuperAdmin(user.id)) {
    try { impersonateOrg = JSON.parse(impersonateCookie) } catch { /* ignore */ }
  }

  let activeOrgId: string | undefined
  let activeOrgName: string | undefined

  if (impersonateOrg) {
    activeOrgId = impersonateOrg.id
    activeOrgName = impersonateOrg.name
  } else if (hasOrgs) {
    const activeSlug = await resolveActiveOrgSlug(user.id, memberships ?? [])
    const activeOrg = (memberships ?? []).find(
      (o) => (o as any).organizations?.slug === activeSlug,
    ) as any ?? (memberships ?? [])[0] as any
    const orgData = activeOrg?.organizations
    activeOrgId = orgData?.id
    activeOrgName = orgData?.name
  }

  // Fetch events scoped to the active org only
  const { data: events } = activeOrgId
    ? await supabase
        .from('events')
        .select('id, title, slug, status, event_type, start_at, end_at, registration_count, checked_in_count, venue_city, venue_state, org_id')
        .eq('org_id', activeOrgId)
        .order('start_at', { ascending: false })
    : { data: [] }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">Events</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">
            {events?.length ?? 0} event{events?.length !== 1 ? 's' : ''}{activeOrgName ? ` in ${activeOrgName}` : ''}
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
