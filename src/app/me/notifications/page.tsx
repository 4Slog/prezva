import { requireUser } from '@/lib/auth/get-user'
import { getMyNotifications } from '@/lib/attendees/profile-actions'
import Link from 'next/link'

export default async function MyNotificationsPage() {
  await requireUser()
  const notifications = await getMyNotifications()
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Notifications</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        Announcements from events you&apos;re registered for.
      </p>

      {notifications.length === 0 ? (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '3rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 14 }}>
          No announcements yet. You&apos;ll see event updates here once organizers send them.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifications.map((n: any) => {
            const sentAt = n.sent_at ? new Date(n.sent_at) : null
            const isRecent = sentAt && (now - sentAt.getTime()) < 7 * 24 * 60 * 60 * 1000
            return (
              <div key={n.id} style={{ background: 'var(--pz-surface)', border: `1px solid ${isRecent ? 'var(--pz-teal)44' : 'var(--pz-border)'}`, borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 2 }}>{n.title}</p>
                    {n.events?.title && (
                      <Link
                        href={`/e/${n.events.slug}`}
                        style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none' }}
                      >
                        {n.events.title}
                      </Link>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {sentAt && (
                      <span style={{ fontSize: 11, color: 'var(--pz-muted)', whiteSpace: 'nowrap' }}>
                        {sentAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span style={{ fontSize: 10, background: 'var(--pz-bg)', color: 'var(--pz-muted)', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize', border: '1px solid var(--pz-border)' }}>
                      {n.channel ?? 'email'}
                    </span>
                  </div>
                </div>
                {n.body && (
                  <p style={{ fontSize: 13, color: 'var(--pz-muted)', lineHeight: 1.5, marginTop: 4 }}>
                    {n.body.length > 200 ? `${n.body.slice(0, 200)}…` : n.body}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
