import { requireAdmin } from '@/lib/admin/gate'
import { VerifyForm } from './VerifyForm'

export default async function AdminVerifyPage() {
  // Must be a platform admin to reach this page.
  const email = await requireAdmin()
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--pz-bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--pz-surface)',
          border: '1px solid var(--pz-border)',
          borderRadius: 12,
          padding: '2rem',
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--pz-teal-ink)' }}>
            Prezva Admin
          </span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--pz-text)', margin: '0.5rem 0 0.25rem' }}>
            Confirm your identity
          </h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>
            Re-enter your password to access the operator console. Access expires after 1 hour.
          </p>
        </div>
        <VerifyForm email={email} />
      </div>
    </div>
  )
}
