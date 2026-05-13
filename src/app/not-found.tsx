import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0D1B2A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div
          style={{
            width: 48,
            height: 48,
            background: '#00BFA6',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <span style={{ color: '#0D1B2A', fontWeight: 900, fontSize: 26 }}>P</span>
        </div>
        <p style={{ fontSize: 72, fontWeight: 900, color: '#00BFA6', lineHeight: 1, margin: '0 0 8px' }}>
          404
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#F0F4F8', margin: '0 0 12px' }}>
          Page not found
        </h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 28px', lineHeight: 1.6 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: 'inline-block',
            background: '#00BFA6',
            color: '#0D1B2A',
            padding: '10px 24px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
