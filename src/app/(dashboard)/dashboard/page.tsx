import Link from 'next/link'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getUserOrgs } from '@/lib/orgs/actions'
import { SetupChecklist } from '@/components/dashboard/SetupChecklist'
import { StaffOnboardingModal } from '@/components/staff/StaffOnboardingModal'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

type Props = { searchParams: Promise<{ error?: string; joined?: string; role?: string }> }

export default async function DashboardPage({ searchParams }: Props) {
  const { error: errorParam, joined: joinedOrg, role: joinedRole } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()

  // Impersonation cookie — set by super admin
  const cookieStore = await cookies()
  const impersonateCookie = cookieStore.get('pz_impersonate_org')?.value
  let impersonateOrg: { id: string; name: string; slug: string } | null = null
  if (impersonateCookie) {
    try { impersonateOrg = JSON.parse(impersonateCookie) } catch { /* ignore */ }
  }

  const orgs = await getUserOrgs()

  // Anyone landing on /dashboard without an org belongs in their personal hub.
  // /onboarding is only reachable now by explicit click from /me.
  if (orgs.length === 0) {
    redirect('/me')
  }

  // Impersonation: use the impersonated org instead of the user's own org
  let orgId: string
  let orgSlug: string
  let orgName: string
  let myRole: string

  if (impersonateOrg) {
    orgId = impersonateOrg.id
    orgSlug = impersonateOrg.slug
    orgName = impersonateOrg.name
    myRole = 'owner'
  } else {
    // Auto-select: use first org (single-org owners get stats immediately)
    const firstOrg = orgs[0] as any
    const orgData = firstOrg.organizations
    orgId = orgData?.id
    orgSlug = orgData?.slug
    orgName = orgData?.name
    myRole = firstOrg.role as string
  }

  // Fetch profile for greeting
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()
  const displayName = (profile as any)?.full_name ?? user.email?.split('@')[0] ?? 'there'

  // Fetch all org event IDs (needed for ticket/registration counts)
  const { data: orgEvents } = await supabase.from('events').select('id').eq('org_id', orgId)
  const orgEventIds = (orgEvents ?? []).map((e: any) => e.id)

  // Fetch real dashboard stats + checklist state in parallel
  const [
    membersResult, integrationsResult, registeredResult, checkedInResult,
    ticketCountResult, publishedCountResult, stripeRow,
  ] = await Promise.all([
    supabase.from('org_members').select('id').eq('org_id', orgId).limit(2),
    supabase.from('org_integrations').select('id').eq('org_id', orgId).eq('status', 'active').limit(1),
    // Confirmed registrations across all org events
    orgEventIds.length > 0
      ? supabase.from('registrations').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').in('event_id', orgEventIds)
      : Promise.resolve({ count: 0 }),
    // Checked-in registrations across all org events
    orgEventIds.length > 0
      ? supabase.from('check_ins').select('id', { count: 'exact', head: true }).is('session_id', null).in('event_id', orgEventIds)
      : Promise.resolve({ count: 0 }),
    // Ticket types for this org
    orgEventIds.length > 0
      ? supabase.from('ticket_types').select('id', { count: 'exact', head: true }).in('event_id', orgEventIds)
      : Promise.resolve({ count: 0 }),
    // Published events
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'published'),
    // Stripe Connect status
    supabase.from('organizations').select('stripe_charges_enabled').eq('id', orgId).maybeSingle(),
  ])

  const confirmedCount = (registeredResult as any).count ?? 0
  const checkedInCount = (checkedInResult as any).count ?? 0
  const ticketCount = (ticketCountResult as any).count ?? 0
  const publishedCount = (publishedCountResult as any).count ?? 0

  const hasEvent = orgEventIds.length > 0
  const hasTickets = ticketCount > 0
  const hasPublishedEvent = publishedCount > 0
  const hasMultipleMembers = (membersResult.data?.length ?? 0) > 1
  const hasIntegration = (integrationsResult.data?.length ?? 0) > 0
  const hasStripeConnected = (stripeRow as any)?.data?.stripe_charges_enabled === true

  const checklistItems = [
    { label: 'Organization created',                done: true },
    { label: 'Create your first event',             done: hasEvent,            href: '/events/new' },
    { label: 'Add a ticket type',                   done: hasTickets,          href: '/events' },
    { label: 'Connect Stripe for paid tickets',     done: hasStripeConnected,  href: `/orgs/${orgSlug}/settings` },
    { label: 'Publish your event page',             done: hasPublishedEvent,   href: '/events' },
    { label: 'Invite a team member',                done: hasMultipleMembers,  href: `/orgs/${orgSlug}/settings` },
    { label: 'Connect an integration (optional)',   done: hasIntegration,      href: `/orgs/${orgSlug}/integrations` },
  ]

  const showChecklist = checklistItems.filter(i => !i.done).length > 0

  return (
    <div>
      {impersonateOrg && (
        <div className="mb-6 rounded-lg px-4 py-3 flex items-center justify-between"
          style={{ background: 'var(--pz-warning-bg)', border: '1px solid var(--pz-warning-fill)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--pz-warning-fill)' }}>
            You are viewing as owner of {impersonateOrg.name} (Support mode)
          </span>
          <Link href="/admin/impersonate/exit" className="text-sm underline" style={{ color: 'var(--pz-warning-fill)' }}>
            Exit impersonation
          </Link>
        </div>
      )}
      {myRole === 'staff' && (
        <StaffOnboardingModal userId={user.id} orgName={orgName ?? 'your organization'} />
      )}
      {errorParam === 'admin_required' && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'var(--pz-warning-bg)', border: '1px solid var(--pz-warning-fill)', color: 'var(--pz-warning)' }}
        >
          You don&apos;t have admin access. Contact Paul if you think you should.
        </div>
      )}
      {joinedOrg && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'var(--pz-teal-bg)', border: '1px solid var(--pz-teal)', color: 'var(--pz-teal-ink)' }}
        >
          You&apos;ve joined <strong>{joinedOrg}</strong>{joinedRole ? ` as ${joinedRole}` : ''}.
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>
          Organizer Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Welcome back, {displayName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: 'Registered',      value: confirmedCount.toString() },
          { label: 'Checked In',      value: checkedInCount.toString() },
          { label: 'Active Sessions', value: '0' },
          { label: 'System Health',   value: '100%' },
        ].map((s) => (
          <div key={s.label} className="pz-card p-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--pz-muted)' }}>{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: 'var(--pz-text)' }}>{s.value}</p>
            <div className="pz-stat-bar" />
          </div>
        ))}
      </div>

      {showChecklist && (
        <div className="mb-8">
          <SetupChecklist items={checklistItems} />
        </div>
      )}
    </div>
  )
}
