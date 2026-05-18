import { requireUser } from '@/lib/auth/get-user'
import { getMyRegistrations } from '@/lib/attendees/profile-actions'
import Link from 'next/link'
import MyEventsClient from './events-client'

type Tab = 'upcoming' | 'past' | 'cancelled'

export default async function MyEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  await requireUser()
  const { tab } = await searchParams
  const active = (tab ?? 'upcoming') as Tab

  const registrations = await getMyRegistrations()
  const now = new Date()

  const groups = {
    upcoming: registrations.filter(
      (r: any) => r.events?.start_at && new Date(r.events.start_at) >= now && r.status !== 'cancelled'
    ),
    past: registrations.filter(
      (r: any) => r.events?.start_at && new Date(r.events.start_at) < now && r.status !== 'cancelled'
    ),
    cancelled: registrations.filter((r: any) => r.status === 'cancelled'),
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: `Upcoming (${groups.upcoming.length})` },
    { key: 'past', label: `Past (${groups.past.length})` },
    { key: 'cancelled', label: `Cancelled (${groups.cancelled.length})` },
  ]

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 20 }}>My Events</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid var(--pz-border)', paddingBottom: 0 }}>
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/me/events?tab=${t.key}`}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: active === t.key ? 'var(--pz-teal)' : 'var(--pz-muted)',
              textDecoration: 'none',
              borderBottom: active === t.key ? '2px solid var(--pz-teal)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <MyEventsClient groups={groups} active={active} />
    </div>
  )
}
