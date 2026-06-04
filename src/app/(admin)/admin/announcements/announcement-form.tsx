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
    <div className="rounded-xl border border-[#1E3A5F] bg-[#112240] p-6 space-y-4">
      {result && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#00BFA622', border: '1px solid #2DD4BF' }}>
          <span className="text-[#2DD4BF] font-medium">Sent to {result.sent} org owner{result.sent !== 1 ? 's' : ''}</span>
        </div>
      )}
      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#EF444422', border: '1px solid var(--pz-error)' }}>
          <span className="text-red-400">{error}</span>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-[#94A3B8] mb-1">Subject</label>
        <input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Email subject..."
          className="w-full bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#2DD4BF]"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-[#94A3B8] mb-1">Message</label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Your announcement..."
          rows={8}
          className="w-full bg-[#0D1B2A] border border-[#1E3A5F] rounded-lg px-3 py-2 text-sm text-[#F0F4F8] focus:outline-none focus:border-[#2DD4BF] resize-y"
        />
      </div>
      <button
        onClick={handleSend}
        disabled={sending || !subject.trim() || !message.trim()}
        className="px-5 py-2 rounded-lg text-sm font-bold text-[#0D1B2A] disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: '#2DD4BF' }}
      >
        {sending ? 'Sending...' : 'Send to all org owners'}
      </button>
    </div>
  )
}
