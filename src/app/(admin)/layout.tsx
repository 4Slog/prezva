import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminStepUp } from '@/lib/admin/gate'
import { UserMenu } from '@/components/auth/UserMenu'

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/orgs', label: 'Organizations' },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/revenue', label: 'Revenue' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/announcements', label: 'Announcements' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Hard gate: must be a platform admin (ADMIN_EMAILS allowlist). Redirects otherwise.
  await requireAdmin()
  // Step-up gate: re-confirmed identity required for this session window.
  await requireAdminStepUp()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let adminAvatarUrl: string | null = null
  if (user) {
    const { data: profileRow } = await supabase.from('profiles').select('avatar_url').eq('id', user.id).maybeSingle()
    adminAvatarUrl = profileRow?.avatar_url ?? null
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--pz-chrome)' }}>
      <header
        className="h-14 flex items-center justify-between px-6 border-b"
        style={{ background: 'var(--pz-chrome-2)', borderColor: 'var(--pz-chrome-line)' }}
      >
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--pz-teal)' }}>Prezva Admin</span>
        {user && (
          <UserMenu
            email={user.email ?? ''}
            name={(user.user_metadata as { full_name?: string } | null)?.full_name ?? null}
            avatarUrl={adminAvatarUrl}
          />
        )}
      </header>
      <div className="flex flex-1">
        <aside
          className="w-52 flex-shrink-0 p-4 flex flex-col"
          style={{ background: 'var(--pz-chrome-2)', borderRight: '1px solid var(--pz-chrome-line)' }}
        >
          <nav className="space-y-1 flex-1">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-lg text-sm transition-colors hover:text-[var(--pz-chrome-text)] hover:bg-[var(--pz-chrome-elevated)]"
                style={{ color: 'var(--pz-chrome-muted)' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pt-4" style={{ borderTop: '1px solid var(--pz-chrome-line)' }}>
            <Link href="/dashboard" className="text-xs hover:opacity-80" style={{ color: 'var(--pz-chrome-muted)' }}>
              ← Back to dashboard
            </Link>
          </div>
        </aside>
        <main className="flex-1 p-8 overflow-auto" style={{ background: 'var(--pz-bg)' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
