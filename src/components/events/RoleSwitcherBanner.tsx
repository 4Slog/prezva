'use client'

interface Role {
  type: 'attendee' | 'speaker' | 'volunteer'
  label: string
  href: string
  icon: string
}

interface Props { roles: Role[] }

export function RoleSwitcherBanner({ roles }: Props) {
  if (roles.length <= 1) return null
  return (
    <div style={{
      background: 'var(--pz-surface)', border: '1px solid var(--pz-border)',
      borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1.5rem'
    }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--pz-muted)',
                  textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                  margin: '0 0 10px' }}>
        You have multiple roles at this event
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
        {roles.map(role => (
          <a key={role.type} href={role.href}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.5rem 0.875rem', borderRadius: 8, fontSize: 13,
              fontWeight: 600, textDecoration: 'none',
              background: role.type === 'attendee' ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
              color: role.type === 'attendee' ? 'var(--pz-on-accent)' : 'var(--pz-text)',
              border: role.type === 'attendee' ? 'none' : '1px solid var(--pz-border)',
            }}>
            {role.icon} {role.label}
          </a>
        ))}
      </div>
    </div>
  )
}
