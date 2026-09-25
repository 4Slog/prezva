import { requireUser } from '@/lib/auth/get-user'
import { getNotifications } from '@/lib/notifications/notification-actions'
import Link from 'next/link'

const TYPE_LABEL: Record<string, string> = {
  announcement: 'Announcement',
  certificate: 'Certificate',
  video_chat_request: 'Video chat',
}

// The same in-app inbox the header bell shows (user_notifications, 0155):
// event announcements, certificates and video-chat requests.
export default async function MyNotificationsPage() {
  await requireUser()
  const notifications = await getNotifications(50)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--pz-text)', marginBottom: 4 }}>Notifications</h1>
      <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 28 }}>
        Announcements, certificates and requests from your events.
      </p>

      {notifications.length === 0 ? (
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '3rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 14 }}>
          No notifications yet. You&apos;ll see event updates here once organizers send them.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifications.map(n => {
            const createdAt = new Date(n.created_at)
            return (
              <div key={n.id} style={{ background: 'var(--pz-surface)', border: `1px solid ${n.is_read ? 'var(--pz-border)' : 'var(--pz-teal)'}`, borderRadius: 10, padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 600, color: 'var(--pz-text)', marginBottom: 2 }}>{n.title}</p>
                    {n.url && (
                      <Link href={n.url} style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none' }}>
                        View →
                      </Link>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--pz-muted)', whiteSpace: 'nowrap' }}>
                      {createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ fontSize: 10, background: 'var(--pz-bg)', color: 'var(--pz-muted)', padding: '2px 6px', borderRadius: 4, border: '1px solid var(--pz-border)' }}>
                      {TYPE_LABEL[n.type] ?? n.type}
                    </span>
                  </div>
                </div>
                {n.body && (
                  <p style={{ fontSize: 13, color: 'var(--pz-muted)', lineHeight: 1.5, marginTop: 4 }}>{n.body}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
