'use client'

import { useState } from 'react'
import { sendPlatformAnnouncement } from '@/lib/admin/platform-actions'

export function AnnouncementForm() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    if (!subject.trim() || !message.trim()) return
    if (!window.confirm(`Send this announcement to all org owners? This cannot be undone.`)) return
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await sendPlatformAnnouncement(subject.trim(), message.trim())
      setResult(res)
      setSubject('')
      setMessage('')
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--pz-border)] bg-[var(--pz-surface)] p-6 space-y-4">
      {result && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--pz-teal-bg)', border: '1px solid var(--pz-teal)' }}>
          <span className="text-[var(--pz-teal-ink)] font-medium">Sent to {result.sent} org owner{result.sent !== 1 ? 's' : ''}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--pz-error-bg)', border: '1px solid var(--pz-error)' }}>
          <span className="text-[var(--pz-error)]">{error}</span>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-[var(--pz-muted)] mb-1">Subject</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[var(--pz-muted)] mb-1">Message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Your announcement..."
          rows={8}
          className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)] resize-y"
        />
      </div>
      <button
        onClick={handleSend}
        disabled={sending || !subject.trim() || !message.trim()}
        className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--pz-on-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: 'var(--pz-teal)' }}
      >
        {sending ? 'Sending...' : 'Send to all org owners'}
      </button>
    </div>
  )
}
