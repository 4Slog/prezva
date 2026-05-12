import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getUserOrgs } from '@/lib/orgs/actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { SetupChecklist } from '@/components/dashboard/SetupChecklist'
import { redirect } from 'next/navigation'

type Props = { searchParams: Promise<{ error?: string }> }

export default async function DashboardPage({ searchParams }: Props) {
  const { error: errorParam } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()
  const orgs = await getUserOrgs()

  // Sprint 19: users with no org membership are attendees, not organizers.
  // Route them to their most recent confirmed event or to /onboarding.
  if (orgs.length === 0) {
    // Admin client: bypass RLS to look up registrations by email (anon registrants have no auth.uid)
    const admin = createAdminClient()
    const { data: recentReg } = await admin
      .from('registrations')
      .select('event_id, events(slug)')
      .eq('attendee_email', user.email)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const slug = (recentReg?.events as { slug?: string } | null)?.slug
    if (slug) redirect(`/e/${slug}/my-agenda`)
    redirect('/onboarding')
  }

  // Compute checklist state for the first org (if any)
  let checklistItems = null
  if (orgs.length > 0) {
    const orgData = (orgs[0] as any).organizations
    const orgId = orgData?.id

    const [eventsResult, membersResult, integrationsResult] = await Promise.all([
      supabase.from('events').select('id').eq('org_id', orgId).limit(1),
      supabase.from('org_members').select('id').eq('org_id', orgId).limit(2),
      supabase.from('org_integrations').select('id').eq('org_id', orgId).eq('status', 'active').limit(1),
    ])

    const hasEvent = (eventsResult.data?.length ?? 0) > 0
    const hasMultipleMembers = (membersResult.data?.length ?? 0) > 1
    const hasIntegration = (integrationsResult.data?.length ?? 0) > 0
    const orgSlug = orgData?.slug

    checklistItems = [
      { label: 'Create your organization', done: true },
      { label: 'Create your first event', done: hasEvent, href: '/events/new' },
      { label: 'Invite a team member', done: hasMultipleMembers, href: `/orgs/${orgSlug}/settings` },
      { label: 'Connect an integration (optional)', done: hasIntegration, href: `/orgs/${orgSlug}/integrations` },
      { label: 'Publish your event', done: false, href: '/events' },
    ]
  }

  const showChecklist = checklistItems && checklistItems.filter(i => !i.done).length > 0

  return (
    <div>
      {errorParam === 'admin_required' && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#FCD34D' }}
        >
          You don&apos;t have admin access. Contact Paul if you think you should.
        </div>
      )}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>
          Organizer Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Welcome back, {user.email}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: 'Registered',       value: '—' },
          { label: 'Checked In',       value: '—' },
          { label: 'Active Sessions',  value: '—' },
          { label: 'System Health',    value: '100%' },
        ].map((s) => (
          <div key={s.label} className="pz-card p-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--pz-muted)' }}>{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: 'var(--pz-text)' }}>{s.value}</p>
            <div className="pz-stat-bar" />
          </div>
        ))}
      </div>

      {showChecklist && checklistItems && (
        <div className="mb-8">
          <SetupChecklist items={checklistItems} />
        </div>
      )}

      {orgs.length === 0 && (
        <div className="pz-card p-8 text-center">
          <p className="text-lg font-semibold mb-2" style={{ color: 'var(--pz-text)' }}>No events yet</p>
          <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>Create an organization first, then add your first event.</p>
          <a href="/orgs/new" className="inline-block rounded-lg px-4 py-2 text-sm font-semibold transition-colors" style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>
            Create organization
          </a>
        </div>
      )}
    </div>
  )
}
