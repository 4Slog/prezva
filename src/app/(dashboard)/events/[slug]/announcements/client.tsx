'use client'
import { useState, useTransition } from 'react'
import { Send, Trash2, Mail, Bell, BellRing } from 'lucide-react'
import { createAnnouncement, deleteAnnouncement } from '@/lib/announcements/actions'

interface Announcement {
  id: string; title: string; body: string; channel: string
  sent_at: string | null; recipient_count: number; segment: string | null
}
const CHANNEL_ICON = { email: Mail, push: Bell, both: BellRing }
const CHANNEL_COLOR: Record<string,string> = { email: '#0891b2', push: '#7c3aed', both: '#059669' }

export default function AnnouncementsClient({ announcements: init, eventId }: {
  announcements: Announcement[]; eventId: string; slug: string
}) {
  const [announcements, setAnnouncements] = useState(init)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createAnnouncement(eventId, fd)
      if ('error' in res && res.error) { setError(res.error); return }
      if ('data' in res && res.data) {
        setAnnouncements(prev => [res.data as Announcement, ...prev])
        setShowForm(false)
      }
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    startTransition(async () => {
      await deleteAnnouncement(id, eventId)
      setAnnouncements(prev => prev.filter(a => a.id !== id))
    })
  }

  return (
    <div>
      {!showForm && (
        <button onClick={() => setShowForm(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', marginBottom: '1.5rem' }}>
          <Send size={16} /> New Announcement
        </button>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem', background: 'var(--color-surface)' }}>
          <h2 style={{ fontWeight: 700, marginBottom: '1rem' }}>New Announcement</h2>
          {error && <p style={{ color: '#ef4444', marginBottom: '0.75rem', fontSize: 14 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Subject</label>
              <input name="title" required maxLength={200} placeholder="Announcement subject..." style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Message</label>
              <textarea name="body" required maxLength={2000} rows={4} placeholder="Write your message..." style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Channel</label>
              <select name="channel" style={{ padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }}>
                <option value="email">Email only</option>
                <option value="push">Push only</option>
                <option value="both">Email + Push</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="submit" disabled={isPending} style={{ background: 'var(--color-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>
                {isPending ? 'Sending...' : 'Send Now'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ background: 'var(--color-border)', color: 'var(--color-text)', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </form>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {announcements.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem 0' }}>No announcements sent yet.</p>
        )}
        {announcements.map(a => {
          const Icon = CHANNEL_ICON[a.channel as keyof typeof CHANNEL_ICON] ?? Mail
          const color = CHANNEL_COLOR[a.channel] ?? '#0891b2'
          return (
            <div key={a.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '1rem 1.25rem', background: 'var(--color-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', gap: 12, flex: 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{a.title}</p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 6, lineHeight: 1.5 }}>{a.body}</p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-text-muted)' }}>
                    <span>{a.recipient_count} recipients</span>
                    <span>{a.sent_at ? new Date(a.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Draft'}</span>
                    <span style={{ background: color + '22', color, padding: '1px 8px', borderRadius: 20, textTransform: 'capitalize' }}>{a.channel}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 4, flexShrink: 0 }}>
                <Trash2 size={16} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
