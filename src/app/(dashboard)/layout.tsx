import { requireUser } from '@/lib/auth/get-user'
import { getUserOrgs } from '@/lib/orgs/actions'
import Link from 'next/link'
import { OrgSwitcher } from '@/components/orgs/OrgSwitcher'
import { SyncHealthPill } from '@/components/layout/SyncHealthPill'
import { UserMenu } from '@/components/auth/UserMenu'

const NAV = [
  { href: '/dashboard',        label: 'Dashboard',     icon: '⊞' },
  { href: '/events',           label: 'Events',        icon: '📅' },
]

const NAV_ORG = [
  { href: '/orgs',             label: 'My Org',        icon: '🏢' },
  { href: '/orgs/settings',    label: 'Settings',      icon: '⚙️' },
  { href: '/orgs/templates',   label: 'Templates',     icon: '📐' },
  { href: '/orgs/integrations',label: 'Integrations',  icon: '🔌' },
  { href: '/orgs/audit-log',   label: 'Audit Log',     icon: '🔍' },
]

const NAV_BOTTOM = [
  { href: '/help',             label: 'Help',          icon: '❓' },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser()
  const orgs = await getUserOrgs()

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--pz-bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="flex w-56 flex-shrink-0 flex-col"
        style={{ background: 'var(--pz-surface)', borderRight: '1px solid var(--pz-border)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            P
          </div>
          <span className="text-lg font-bold" style={{ color: 'var(--pz-text)' }}>
            Prezva
          </span>
        </div>

        {/* Org switcher */}
        <div className="px-3 pb-3">
          <OrgSwitcher orgs={orgs as unknown as Parameters<typeof OrgSwitcher>[0]['orgs']} />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="pz-nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
          <div className="pt-2 pb-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[#475569]">Organization</p>
          </div>
          {NAV_ORG.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="pz-nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Bottom nav + Offline Sync Health */}
        <div className="px-2 pb-2 space-y-0.5">
          {NAV_BOTTOM.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="pz-nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all"
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </div>
        <div className="px-3 pb-5">
          <SyncHealthPill />
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header
          className="flex h-14 flex-shrink-0 items-center justify-between px-6"
          style={{ borderBottom: '1px solid var(--pz-border)' }}
        >
          <div />
          <div className="flex items-center gap-3">
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
