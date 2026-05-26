import Image from 'next/image'
import { requireUser } from '@/lib/auth/get-user'
import { getUserContexts } from '@/lib/auth/get-contexts'
import { UserMenu } from '@/components/auth/UserMenu'
import { ContextSwitcher } from '@/components/ContextSwitcher'
import Link from 'next/link'

export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  const contexts = await getUserContexts(user.id)

  const navLinks = [
    { href: '/me', label: 'Home' },
    { href: '/me/events', label: 'My Events' },
    { href: '/me/wallet', label: 'Wallet' },
    { href: '/me/profile', label: 'Profile' },
    { href: '/me/notifications', label: 'Notifications' },
    { href: '/me/preferences', label: 'Preferences' },
    { href: '/me/settings', label: 'Account' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.5rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {/* Logo */}
          <Link href="/me" style={{ textDecoration: 'none', flexShrink: 0 }}>
            <Image src="/logo-mark.svg" alt="Prezva" width={28} height={23} />
          </Link>

          {/* Context switcher */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start', paddingLeft: 12 }}>
            <ContextSwitcher currentContext="personal" contexts={contexts} />
          </div>

          {/* Nav — desktop only */}
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
