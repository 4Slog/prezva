import { requireUser } from '@/lib/auth/get-user'
import { getMyRegistrations } from '@/lib/attendees/profile-actions'
import Link from 'next/link'

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

  const list = groups[active] ?? []

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

      {list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--pz-muted)', fontSize: 14 }}>
          No {active} events.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((reg: any) => {
            const ev = reg.events
            const date = ev?.start_at ? new Date(ev.start_at) : null
            const endDate = ev?.end_at ? new Date(ev.end_at) : null
            return (
              <div key={reg.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {date && (
                  <div style={{ minWidth: 52, textAlign: 'center', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '6px 4px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--pz-text)', lineHeight: 1.1 }}>
                      {date.getDate()}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--pz-muted)' }}>
                      {date.getFullYear()}
                    </div>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 4 }}>{ev?.title ?? 'Event'}</p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 6 }}>
                    {ev?.is_virtual ? 'Virtual event' : ev?.venue_name ?? 'TBA'}
                    {date && endDate ? ` · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} – ${endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {reg.ticket_types?.name && (
                      <span style={{ fontSize: 11, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                        {reg.ticket_types.name}
                      </span>
                    )}
                    <span style={{ fontSize: 11, background: reg.status === 'confirmed' ? '#22c55e22' : 'var(--pz-border)', color: reg.status === 'confirmed' ? '#22c55e' : 'var(--pz-muted)', padding: '2px 8px', borderRadius: 4, fontWeight: 500, textTransform: 'capitalize' }}>
                      {reg.status}
                    </span>
                  </div>
                </div>
                {ev?.slug && (
                  <Link
                    href={`/e/${ev.slug}`}
                    style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}
                  >
                    View event →
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
