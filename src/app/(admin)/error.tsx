'use client'
import { isPermissionError } from '@/lib/auth/permission-error'

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  if (isPermissionError(error)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <p style={{ fontSize: 48, marginBottom: '1rem' }}>🔒</p>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', margin: '0 0 8px' }}>You don&apos;t have permission</h2>
          <p style={{ fontSize: 14, color: 'var(--pz-muted)', margin: '0 0 1.5rem' }}>You don&apos;t have access to this admin page.</p>
          <a href="/admin" style={{ display: 'inline-block', padding: '0.625rem 1.25rem', borderRadius: 8, border: 'none', background: 'var(--pz-teal)', color: '#0D1B2A', fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>Go to admin</a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <p style={{ fontSize: 48, marginBottom: '1rem' }}>😕</p>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', margin: '0 0 8px' }}>Something went wrong</h2>
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', margin: '0 0 1.5rem' }}>We had trouble loading this admin page.</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={reset} style={{ padding: '0.625rem 1.25rem', borderRadius: 8, border: 'none', background: 'var(--pz-teal)', color: '#0D1B2A', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>Try again</button>
          <a href="/admin" style={{ padding: '0.625rem 1.25rem', borderRadius: 8, border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', textDecoration: 'none', fontSize: 14 }}>Go to admin</a>
        </div>
      </div>
    </div>
  )
}
