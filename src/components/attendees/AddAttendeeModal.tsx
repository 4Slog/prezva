'use client'

import { useState } from 'react'
import { manualAddAttendee } from '@/lib/attendees/actions'
import { Modal } from '@/components/ui/Modal'

interface TicketType { id: string; name: string; price_cents?: number }

interface AddAttendeeModalProps {
  eventId: string
  tickets: TicketType[]
  onClose: () => void
  onAdded: () => void
}

export function AddAttendeeModal({ eventId, tickets, onClose, onAdded }: AddAttendeeModalProps) {
  // Default to cheapest ticket so staff don't accidentally comp VIPs
  const sorted = [...tickets].sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))
  const [form, setForm] = useState({
    attendeeName: '',
    attendeeEmail: '',
    ticketTypeId: sorted[0]?.id ?? '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--pz-teal)]'
  const inputStyle = {
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
    color: 'var(--pz-text)',
  }
  const labelStyle = { color: 'var(--pz-text-muted)' }

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
    <Modal onClose={onClose} title="Add Attendee">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>Full Name</label>
          <input
            required
            value={form.attendeeName}
            onChange={e => setForm(f => ({ ...f, attendeeName: e.target.value }))}
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>Email</label>
          <input
            required
            type="email"
            value={form.attendeeEmail}
            onChange={e => setForm(f => ({ ...f, attendeeEmail: e.target.value }))}
            className={inputCls}
            style={inputStyle}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>Ticket Type</label>
          <select
            value={form.ticketTypeId}
            onChange={e => setForm(f => ({ ...f, ticketTypeId: e.target.value }))}
            className={inputCls}
            style={inputStyle}
          >
            {sorted.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.price_cents != null ? ` — ${t.price_cents === 0 ? 'Free' : `$${(t.price_cents / 100).toFixed(2)}`}` : ''}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: '#3B0000', color: '#FCA5A5' }}>
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            {loading ? 'Adding…' : 'Add Attendee'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
