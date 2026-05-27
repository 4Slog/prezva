import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/gate'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-[#0D1B2A] flex flex-col">
      <header
        className="h-14 flex items-center justify-between px-6 border-b"
        style={{ background: '#071629', borderColor: '#1E3A5F' }}
      >
        <span className="text-xs font-bold text-[#00BFA6] uppercase tracking-widest">Prezva Admin</span>
        {user && (
          <UserMenu
            email={user.email ?? ''}
            name={(user.user_metadata as { full_name?: string } | null)?.full_name ?? null}
          />
        )}
      </header>
      <div className="flex flex-1">
        <aside className="w-52 flex-shrink-0 bg-[#071629] border-r border-[#1E3A5F] p-4 flex flex-col">
          <nav className="space-y-1 flex-1">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-3 py-2 rounded-lg text-sm text-[#94A3B8] hover:text-[#F0F4F8] hover:bg-[#1E3A5F]/40 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="pt-4 border-t border-[#1E3A5F]">
            <Link href="/dashboard" className="text-xs text-[#64748B] hover:text-[#94A3B8]">
              ← Back to dashboard
            </Link>
          </div>
        </aside>
        <main className="flex-1 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
