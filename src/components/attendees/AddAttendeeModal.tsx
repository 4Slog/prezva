'use client'

import { useState } from 'react'
import { manualAddAttendee } from '@/lib/attendees/actions'

interface TicketType { id: string; name: string }

interface AddAttendeeModalProps {
  eventId: string
  tickets: TicketType[]
  onClose: () => void
  onAdded: () => void
}

export function AddAttendeeModal({ eventId, tickets, onClose, onAdded }: AddAttendeeModalProps) {
  const [form, setForm] = useState({
    attendeeName: '',
    attendeeEmail: '',
    ticketTypeId: tickets[0]?.id ?? '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await manualAddAttendee({ eventId, ...form })
    setLoading(false)
    if ('error' in result && result.error) { setError(String(result.error)); return }
    onAdded()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl w-full max-w-md p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Add Attendee</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Full Name</label>
            <input
              required
              value={form.attendeeName}
              onChange={e => setForm(f => ({ ...f, attendeeName: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--bg-page)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Email</label>
            <input
              required
              type="email"
              value={form.attendeeEmail}
              onChange={e => setForm(f => ({ ...f, attendeeEmail: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--bg-page)] text-[var(--text-primary)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Ticket Type</label>
            <select
              value={form.ticketTypeId}
              onChange={e => setForm(f => ({ ...f, ticketTypeId: e.target.value }))}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--bg-page)] text-[var(--text-primary)]"
            >
              {tickets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-md hover:opacity-90 disabled:opacity-60"
            >
              {loading ? 'Adding…' : 'Add Attendee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
