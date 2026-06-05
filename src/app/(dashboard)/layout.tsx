import { requireUser } from '@/lib/auth/get-user'
import { getUserOrgs } from '@/lib/orgs/actions'
import { getUserContexts } from '@/lib/auth/get-contexts'
import { isSuperAdmin } from '@/lib/admin/gate'
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

  const defaultOrgSlug =
    (orgs[0] as { organizations?: { slug?: string } } | undefined)?.organizations?.slug ?? null

  // The dashboard layout currently auto-selects the first org for the user.
  const currentContext = defaultOrgSlug ?? 'personal'

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--pz-bg)' }}>

      <OrgShell defaultOrgSlug={defaultOrgSlug} />

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
