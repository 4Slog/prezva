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

const PAYMENT_METHODS = [
  { value: 'comp',    label: 'Complimentary (free)' },
  { value: 'cash',    label: 'Cash' },
  { value: 'card',    label: 'Card (in person)' },
  { value: 'invoice', label: 'Invoice / PO' },
  { value: 'other',   label: 'Other' },
]

export function AddAttendeeModal({ eventId, tickets, onClose, onAdded }: AddAttendeeModalProps) {
  const sorted = [...tickets].sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))
  const [form, setForm] = useState({
    attendeeName: '',
    attendeeEmail: '',
    ticketTypeId: sorted[0]?.id ?? '',
    paymentMethod: 'comp',
    amountPaidCents: sorted[0]?.price_cents ?? 0,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const inputCls = 'w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--pz-teal)]'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }
  const labelStyle = { color: 'var(--pz-text-muted)' }

  function handleTicketChange(ticketTypeId: string) {
    const ticket = tickets.find(t => t.id === ticketTypeId)
    const price = ticket?.price_cents ?? 0
    setForm(f => ({
      ...f,
      ticketTypeId,
      // Auto-set amount to ticket price, reset to comp if free ticket
      paymentMethod: price === 0 ? 'comp' : f.paymentMethod === 'comp' ? 'cash' : f.paymentMethod,
      amountPaidCents: price,
    }))
  }

  function handlePaymentMethodChange(paymentMethod: string) {
    const ticket = tickets.find(t => t.id === form.ticketTypeId)
    const price = ticket?.price_cents ?? 0
    setForm(f => ({
      ...f,
      paymentMethod,
      // Comp = $0, everything else defaults to ticket price
      amountPaidCents: paymentMethod === 'comp' ? 0 : price,
    }))
  }

  const selectedTicket = tickets.find(t => t.id === form.ticketTypeId)
  const isPaidTicket = (selectedTicket?.price_cents ?? 0) > 0
  const showAmountField = form.paymentMethod !== 'comp'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await manualAddAttendee({
      eventId,
      attendeeName: form.attendeeName,
      attendeeEmail: form.attendeeEmail,
      ticketTypeId: form.ticketTypeId,
      amountPaidCents: form.amountPaidCents,
      paymentMethod: form.paymentMethod,
    })
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
            className={inputCls} style={inputStyle}
            placeholder="Jane Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>Email</label>
          <input
            required type="email"
            value={form.attendeeEmail}
            onChange={e => setForm(f => ({ ...f, attendeeEmail: e.target.value }))}
            className={inputCls} style={inputStyle}
            placeholder="jane@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={labelStyle}>Ticket Type</label>
          <select
            value={form.ticketTypeId}
            onChange={e => handleTicketChange(e.target.value)}
            className={inputCls} style={inputStyle}
          >
            {sorted.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{t.price_cents != null ? ` — ${t.price_cents === 0 ? 'Free' : `$${(t.price_cents / 100).toFixed(2)}`}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Payment section — only show for paid tickets */}
        {isPaidTicket && (
          <div className="rounded-lg p-3 space-y-3" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--pz-text-muted)' }}>PAYMENT</p>
            <div>
              <label className="block text-sm font-medium mb-1" style={labelStyle}>Payment method</label>
              <select
                value={form.paymentMethod}
                onChange={e => handlePaymentMethodChange(e.target.value)}
                className={inputCls} style={inputStyle}
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            {showAmountField && (
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>
                  Amount received (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--pz-text-muted)' }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(form.amountPaidCents / 100).toFixed(2)}
                    onChange={e => setForm(f => ({ ...f, amountPaidCents: Math.round(parseFloat(e.target.value || '0') * 100) }))}
                    className={inputCls}
                    style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--pz-text-muted)' }}>
                  Ticket price: ${((selectedTicket?.price_cents ?? 0) / 100).toFixed(2)}
                </p>
              </div>
            )}
            {form.paymentMethod === 'comp' && (
              <p className="text-xs" style={{ color: 'var(--pz-text-muted)' }}>
                Complimentary — attendee will be registered at no charge.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: '#3B0000', color: '#FCA5A5' }}>{error}</p>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button type="button" onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>
            {loading ? 'Adding…' : 'Add Attendee'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
