'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { getNotifications, markAllRead, markRead } from '@/lib/notifications/notification-actions'

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  url: string | null
  is_read: boolean
  created_at: string
}

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(initialUnreadCount)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function handleOpen() {
    setOpen(o => !o)
    if (!loaded) {
      const notifs = await getNotifications(10)
      setNotifications(notifs)
      setLoaded(true)
    }
  }

  async function handleMarkAll() {
    await markAllRead()
    setUnread(0)
    setNotifications(n => n.map(x => ({ ...x, is_read: true })))
  }

  async function handleClick(notif: Notification) {
    if (!notif.is_read) {
      await markRead(notif.id)
      setUnread(u => Math.max(0, u - 1))
      setNotifications(n => n.map(x => x.id === notif.id ? { ...x, is_read: true } : x))
    }
    setOpen(false)
  }

  const typeEmoji: Record<string, string> = {
    announcement: '📢',
    meeting_request: '🤝',
    certificate: '🎓',
    handout: '📄',
    match: '✨',
    follow: '👤',
    system: '🔔',
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        aria-label="Notifications"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', padding: '4px 6px', borderRadius: 8, color: 'var(--pz-muted)' }}
      >
        <span style={{ fontSize: 18 }}>🔔</span>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 0, right: 0, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 10, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 8, width: 320, background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--pz-border)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)' }}>Notifications</p>
            {unread > 0 && (
              <button onClick={handleMarkAll} style={{ fontSize: 11, color: 'var(--pz-teal)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {!loaded ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 13 }}>Loading…</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--pz-muted)', fontSize: 13 }}>No notifications yet.</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} onClick={() => handleClick(n)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--pz-border)', cursor: n.url ? 'pointer' : 'default', background: n.is_read ? 'transparent' : 'rgba(0,191,166,0.05)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{typeEmoji[n.type] ?? '🔔'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600, color: 'var(--pz-text)', marginBottom: 2 }}>{n.title}</p>
                    {n.body && <p style={{ fontSize: 12, color: 'var(--pz-muted)', lineHeight: 1.4 }}>{n.body}</p>}
                    {n.url && (
                      <Link href={n.url} onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: 'var(--pz-teal)', textDecoration: 'none', display: 'inline-block', marginTop: 3 }}>
                        View →
                      </Link>
                    )}
                  </div>
                  {!n.is_read && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pz-teal)', flexShrink: 0, marginTop: 6 }} />}
                </div>
              ))
            )}
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--pz-border)', textAlign: 'center' }}>
            <Link href="/me/notifications" onClick={() => setOpen(false)} style={{ fontSize: 12, color: 'var(--pz-teal)', textDecoration: 'none' }}>
              See all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
