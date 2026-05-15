import Image from 'next/image'
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
        <Image src="/logo-mark.svg" alt="Prezva" width={48} height={40} style={{ margin: '0 auto 24px', display: 'block' }} />
        <p style={{ fontSize: 72, fontWeight: 900, color: '#2DD4BF', lineHeight: 1, margin: '0 0 8px' }}>
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
            background: '#2DD4BF',
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
