import Link from 'next/link'

interface Props {
  reason: string
  next: string
  email?: string
}

export function ClaimToUnlock({ reason, next, email }: Props) {
  const href = email
    ? `/magic?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
    : `/magic?next=${encodeURIComponent(next)}`

  return (
    <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <h2 style={{ fontWeight: 700, marginBottom: 12, color: 'var(--pz-text)', fontSize: '1.25rem' }}>
        Free account required
      </h2>
      <p style={{ color: 'var(--pz-muted)', fontSize: 14, maxWidth: 360, margin: '0 auto 24px' }}>
        {reason}
      </p>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          background: 'var(--pz-teal)',
          color: 'var(--pz-on-accent)',
          padding: '0.625rem 1.5rem',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        Create free account →
      </Link>
    </div>
  )
}
