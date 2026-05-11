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

const inputStyle = {
  background: 'var(--pz-surface-2)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="w-full max-w-md rounded-xl p-6 shadow-2xl"
        style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
      >
        <h2 className="mb-4 text-lg font-semibold" style={{ color: 'var(--pz-text)' }}>Add Attendee</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Full Name</label>
            <input
              required
              value={form.attendeeName}
              onChange={e => setForm(f => ({ ...f, attendeeName: e.target.value }))}
              className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Email</label>
            <input
              required type="email"
              value={form.attendeeEmail}
              onChange={e => setForm(f => ({ ...f, attendeeEmail: e.target.value }))}
              className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Ticket Type</label>
            <select
              value={form.ticketTypeId}
              onChange={e => setForm(f => ({ ...f, ticketTypeId: e.target.value }))}
              className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
            >
              {tickets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--pz-error)' }}>{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="rounded-md px-4 py-2 text-sm"
              style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="rounded-md px-4 py-2 text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {loading ? 'Adding…' : 'Add Attendee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
