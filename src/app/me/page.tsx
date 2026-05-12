import { requireUser } from '@/lib/auth/get-user'
import { getMyRegistrations, getUserProfile } from '@/lib/attendees/profile-actions'
import Link from 'next/link'

export default async function MeLandingPage() {
  const user = await requireUser()
  const [registrations, profile] = await Promise.all([
    getMyRegistrations(),
    getUserProfile(),
  ])

  const name = profile?.display_name ?? user.user_metadata?.full_name ?? user.email ?? 'there'

  const now = new Date()
  const upcoming = registrations
    .filter((r: any) => r.events?.start_at && new Date(r.events.start_at) >= now)
    .slice(0, 3)
  const past = registrations.filter(
    (r: any) => r.events?.start_at && new Date(r.events.start_at) < now
  )

  const completeness = calcCompleteness(profile)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>
        Welcome back, {name}
      </h1>
      <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginBottom: 32 }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {/* Profile completeness */}
      {completeness < 100 && (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 6 }}>
              Your profile is {completeness}% complete
            </p>
            <div style={{ height: 6, background: 'var(--pz-border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${completeness}%`, background: 'var(--pz-teal)', borderRadius: 3, transition: 'width 0.3s' }} />
            </div>
          </div>
          <Link href="/me/profile" style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500 }}>
            Complete profile →
          </Link>
        </div>
      )}

      {/* Upcoming events */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--pz-text)' }}>Upcoming events</h2>
          <Link href="/me/events" style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}>View all</Link>
        </div>

        {upcoming.length === 0 ? (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 14 }}>
            No upcoming events. Browse events to register.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {upcoming.map((reg: any) => {
              const ev = reg.events
              const date = ev?.start_at ? new Date(ev.start_at) : null
              return (
                <div key={reg.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 16 }}>
                  {date && (
                    <div style={{ minWidth: 48, textAlign: 'center', background: 'var(--pz-teal)', borderRadius: 8, padding: '6px 4px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#0D1B2A', textTransform: 'uppercase', letterSpacing: 1 }}>
                        {date.toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#0D1B2A', lineHeight: 1 }}>
                        {date.getDate()}
                      </div>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 2 }}>{ev?.title ?? 'Event'}</p>
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                      {ev?.is_virtual ? 'Virtual' : ev?.venue_name ?? 'TBA'}
                      {reg.ticket_types?.name ? ` · ${reg.ticket_types.name}` : ''}
                    </p>
                  </div>
                  <Link
                    href={`/e/${ev?.slug}`}
                    style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    View →
                  </Link>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Past events — collapsed */}
      {past.length > 0 && (
        <details style={{ marginBottom: 32 }}>
          <summary style={{ cursor: 'pointer', fontSize: 14, color: 'var(--pz-muted)', fontWeight: 500, listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span>▶</span>
            <span>Show past events ({past.length})</span>
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {past.slice(0, 5).map((reg: any) => {
              const ev = reg.events
              return (
                <div key={reg.id} style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)' }}>{ev?.title ?? 'Event'}</p>
                    <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>
                      {ev?.start_at ? new Date(ev.start_at).toLocaleDateString() : ''}
                    </p>
                  </div>
                  <Link href={`/e/${ev?.slug}`} style={{ fontSize: 12, color: 'var(--pz-muted)', textDecoration: 'none' }}>View →</Link>
                </div>
              )
            })}
          </div>
        </details>
      )}

      {/* Quick actions */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12 }}>Quick actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { href: '/me/wallet', label: 'Wallet passes', sub: 'Download tickets & badges' },
            { href: '/me/profile', label: 'Edit profile', sub: 'Update bio & social links' },
            { href: '/me/notifications', label: 'Notifications', sub: 'Event announcements' },
            { href: '/me/preferences', label: 'Preferences', sub: 'Email & push settings' },
          ].map(a => (
            <Link
              key={a.href}
              href={a.href}
              style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem', textDecoration: 'none', display: 'block' }}
            >
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 2 }}>{a.label}</p>
              <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>{a.sub}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

function calcCompleteness(profile: any): number {
  if (!profile) return 10
  const fields = ['display_name', 'photo_url', 'bio', 'pronouns', 'linkedin_url']
  const filled = fields.filter(f => profile[f]).length
  const hasInterests = (profile.interests?.length ?? 0) > 0
  return Math.round(((filled + (hasInterests ? 1 : 0)) / (fields.length + 1)) * 90 + 10)
}
