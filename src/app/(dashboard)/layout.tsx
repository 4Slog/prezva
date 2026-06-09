import { headers, cookies } from 'next/headers'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'
import { getUserOrgs } from '@/lib/orgs/actions'
import { getUserContexts } from '@/lib/auth/get-contexts'
import { isSuperAdmin } from '@/lib/admin/gate'
import { resolveActiveOrgSlug } from '@/lib/auth/active-org'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { OrgShell } from '@/components/layout/OrgShell'
import { UserMenu } from '@/components/auth/UserMenu'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { ContextSwitcher } from '@/components/ContextSwitcher'
import { getUnreadCount } from '@/lib/notifications/notification-actions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const [orgs, unreadCount, contexts] = await Promise.all([
    getUserOrgs(),
    getUnreadCount(),
    getUserContexts(user.id),
  ])
  const superAdmin = isSuperAdmin(user.id)

  // ── Effective org resolution (priority: impersonate > URL slug > cookie/fallback) ──
  const pathname = (await headers()).get('x-pathname') ?? ''
  const urlSlug = pathname.match(/^\/orgs\/([^/]+)/)?.[1] ?? null

  // 1. Impersonation (super-admin override — closes pre-existing gap in this layout)
  const cookieStore = await cookies()
  const impersonateCookie = cookieStore.get('pz_impersonate_org')?.value
  let impersonateOrg: { id: string; name: string; slug: string } | null = null
  if (impersonateCookie && isSuperAdmin(user.id)) {
    try { impersonateOrg = JSON.parse(impersonateCookie) } catch { /* ignore */ }
  }

  let effectiveOrgSlug: string | null
  let effectiveOrgId: string
  if (impersonateOrg) {
    // Impersonation wins over everything — getOrgPermissions short-circuits to '*' for super-admins
    effectiveOrgSlug = impersonateOrg.slug
    effectiveOrgId = impersonateOrg.id
  } else if (urlSlug && orgs.some(o => (o.organizations as unknown as { slug: string } | null)?.slug === urlSlug)) {
    // 2. URL slug (user is viewing an org-scoped route they're a member of)
    effectiveOrgSlug = urlSlug
    const urlOrg = orgs.find(o => (o.organizations as unknown as { slug: string } | null)?.slug === urlSlug)
    effectiveOrgId = urlOrg?.org_id ?? ''
  } else {
    // 3. Cookie / orgs[0] fallback
    effectiveOrgSlug = await resolveActiveOrgSlug(user.id, orgs)
    const activeOrg = orgs.find(o => (o.organizations as unknown as { slug: string } | null)?.slug === effectiveOrgSlug)
    effectiveOrgId = activeOrg?.org_id ?? ''
  }

  const permSet = effectiveOrgId ? await getOrgPermissions(effectiveOrgId, user.id) : new Set<string>()
  const canRolesManage    = permSet.has('*') || permSet.has('org.roles.manage')
  const canBilling        = permSet.has('*') || permSet.has('org.billing')
  const canTemplates      = permSet.has('*') || permSet.has('org.templates.view')
  const canIntegrations   = permSet.has('*') || permSet.has('org.integrations')
  const canAuditLog       = permSet.has('*') || permSet.has('org.audit_log')
  const canSpeakerLibrary = permSet.has('*') || permSet.has('org.speaker_library.view')
  const canOrgSettingsPage = permSet.has('*') || permSet.has('org.settings') || permSet.has('org.members.view') || permSet.has('org.members.invite')

  const eventSlugForNav = pathname.match(/^\/events\/([^/]+)/)?.[1] ?? null
  let eventCanTickets = true
  if (eventSlugForNav && eventSlugForNav !== 'new') {
    const sb = await createClient()
    const { data: ev } = await sb.from('events').select('org_id').eq('slug', eventSlugForNav).maybeSingle()
    if (ev?.org_id) {
      const evPerms = await getOrgPermissions(ev.org_id, user.id)
      eventCanTickets = evPerms.has('*') || evPerms.has('event.tickets') || evPerms.has('event.manage')
    } else { eventCanTickets = false }
  }

  const currentContext = effectiveOrgSlug ?? 'personal'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--pz-bg)' }}>

      <OrgShell
          defaultOrgSlug={effectiveOrgSlug}
          canRolesManage={canRolesManage}
          canBilling={canBilling}
          canTemplates={canTemplates}
          canIntegrations={canIntegrations}
          canAuditLog={canAuditLog}
          canSpeakerLibrary={canSpeakerLibrary}
          canOrgSettingsPage={canOrgSettingsPage}
          eventCanTickets={eventCanTickets}
        />

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex h-14 flex-shrink-0 items-center justify-between px-6"
          style={{ background: 'var(--pz-chrome-elevated)', borderBottom: '1px solid var(--pz-chrome-line)' }}
        >
          <ContextSwitcher currentContext={currentContext} contexts={contexts} isSuperAdmin={superAdmin} />
          <div className="flex items-center gap-3">
            <NotificationBell initialUnreadCount={unreadCount} />
            <UserMenu email={user.email ?? ''} name={(user.user_metadata as { full_name?: string } | null)?.full_name ?? null} />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
