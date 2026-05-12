import { requireUser } from '@/lib/auth/get-user'
import { UserMenu } from '@/components/auth/UserMenu'
import Link from 'next/link'

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  const navLinks = [
    { href: '/me', label: 'My Events' },
    { href: '/me/profile', label: 'Profile' },
    { href: '/me/wallet', label: 'Wallet' },
    { href: '/me/preferences', label: 'Settings' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <Link href="/me" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--pz-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#0D1B2A', fontWeight: 900, fontSize: 14 }}>P</span>
            </div>
          </Link>

          {/* Nav — desktop */}
          <nav style={{ display: 'flex', gap: 4 }} aria-label="Attendee navigation">
            {navLinks.map(n => (
              <Link
                key={n.href}
                href={n.href}
                style={{ color: 'var(--pz-muted)', fontSize: 13, fontWeight: 500, padding: '6px 12px', borderRadius: 6, textDecoration: 'none' }}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <UserMenu email={user.email ?? ''} name={user.user_metadata?.full_name ?? user.email ?? ''} />
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}
