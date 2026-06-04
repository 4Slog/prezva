import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import PassportAdminClient from './client'

type Props = { params: Promise<{ slug: string }> }

export default async function PassportAdminPage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)

  const { getPassportAdmin } = await import('@/lib/engagement/passport-admin-actions')
  const result = await getPassportAdmin(event.id)

  if ('error' in result) return <div style={{ padding: '2rem', color: 'var(--pz-error)' }}>{result.error}</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Passport Game</h1>
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginTop: 4 }}>Create booth locations — attendees scan codes to collect stamps and earn points.</p>
      </div>
      <PassportAdminClient
        eventId={event.id}
        initialLocations={result.locations}
        totalStamps={result.totalStamps}
        leaderboard={result.leaderboard}
      />
    </div>
  )
}
