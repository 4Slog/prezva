import { requireUser } from '@/lib/auth/get-user'
import { getMyPreferences } from '@/lib/attendees/preferences-actions'
import { PreferencesClient } from './client'

export default async function MyPreferencesPage() {
  await requireUser()
  const prefs = await getMyPreferences()

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Preferences</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        Control how Prezva communicates with you.
      </p>
      <PreferencesClient initial={prefs} />
    </div>
  )
}
