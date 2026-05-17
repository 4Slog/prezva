'use client'
import { useEffect } from 'react'
import Link from 'next/link'

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[dashboard-error]', error)
  }, [error])

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 24 }}>This has been logged. Try again or return to the dashboard.</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={reset} style={{ background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
        <Link href="/dashboard" style={{ background: 'transparent', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '8px 20px', color: 'var(--pz-muted)', textDecoration: 'none', fontSize: 14 }}>Return to dashboard</Link>
      </div>
    </div>
  )
}
