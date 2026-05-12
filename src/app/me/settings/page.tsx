import { requireUser } from '@/lib/auth/get-user'
import { SettingsClient } from './client'

export default async function MySettingsPage() {
  const user = await requireUser()

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Account Settings</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        Security, password, and account management.
      </p>
      <SettingsClient email={user.email ?? ''} />
    </div>
  )
}
