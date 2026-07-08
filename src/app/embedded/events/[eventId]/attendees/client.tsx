'use client'

import { useState, useCallback } from 'react'
import { getAttendees, removeAttendee, manualAddAttendee } from '@/lib/embedded/attendees-actions'
import type { AttendeeWithTicket, AttendeePage } from '@/lib/embedded/attendees-actions'

interface EmbedAttendeesClientProps {
  eventId: string
  eventName: string
  initialData: AttendeePage
  tickets: { id: string; name: string; price_cents?: number | null }[]
}

export function EmbedAttendeesClient({ eventId, eventName, initialData, tickets }: EmbedAttendeesClientProps) {
  const pageSize = initialData.pageSize
  const [data, setData] = useState<AttendeePage>(initialData)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    attendeeName: '',
    attendeeEmail: '',
    ticketTypeId: tickets[0]?.id ?? '',
  })
  const [adding, setAdding] = useState(false)

  const applySearch = useCallback(async (q: string) => {
    setSearch(q)
    try {
      const result = await getAttendees(eventId, { search: q || undefined, page: 1, pageSize })
      setData(result)
    } catch {
      setMsg('Could not load attendees.')
    }
  }, [eventId, pageSize])

  async function goToPage(p: number) {
    try {
      const result = await getAttendees(eventId, { search: search || undefined, page: p, pageSize })
      setData(result)
    } catch {
      setMsg('Could not load attendees.')
    }
  }

  async function handleRemove(registrationId: string) {
    setMsg('')
    const result = await removeAttendee(registrationId)
    if (result && 'error' in result) { setMsg(result.error ?? 'Error'); return }
    setData(d => ({
      ...d,
      attendees: d.attendees.filter(a => a.id !== registrationId),
      total: d.total - 1,
    }))
    setMsg('Attendee removed.')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setMsg('')
    const result = await manualAddAttendee({
      eventId,
      attendeeName: addForm.attendeeName,
      attendeeEmail: addForm.attendeeEmail,
      ticketTypeId: addForm.ticketTypeId,
      amountPaidCents: 0,
      paymentMethod: 'comp',
    })
    setAdding(false)
    if (result && 'error' in result) { setMsg(result.error ?? 'Error'); return }
    setShowAdd(false)
    setMsg('Attendee added.')
    setSearch('')
    try {
      const result = await getAttendees(eventId, { page: 1, pageSize })
      setData(result)
    } catch { /* leave the existing success msg */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--pz-text)' }}>{eventName}</h1>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            {data.total} attendee{data.total !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg px-3 py-2 text-sm font-medium"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
        >
          + Add
        </button>
      </div>

      {msg && <p className="text-sm" style={{ color: 'var(--pz-teal-ink)' }}>{msg}</p>}

      <input
        type="text"
        placeholder="Search by name or email…"
        value={search}
        onChange={e => applySearch(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border text-sm"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)', color: 'var(--pz-text)' }}
      />

      {data.attendees.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--pz-muted)' }}>No attendees found.</p>
      ) : (
        <div
          className="rounded-xl overflow-hidden border"
          style={{ borderColor: 'var(--pz-border)' }}
        >
          {data.attendees.map((a: AttendeeWithTicket) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-4 py-3 border-b last:border-0"
              style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--pz-text)' }}>
                  {(a as any).attendee_name}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--pz-muted)' }}>
                  {(a as any).attendee_email} · {a.ticket_name}
                  {a.checked_in && <span className="ml-2 text-green-600 font-medium">✓ Checked in</span>}
                </p>
              </div>
              <button
                onClick={() => handleRemove(a.id)}
                className="ml-3 flex-shrink-0 text-xs px-2 py-1 rounded border"
                style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-muted)' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--pz-muted)' }}>
          <span>Page {data.page} of {data.totalPages}</span>
          <div className="flex gap-2">
            <button disabled={data.page <= 1} onClick={() => goToPage(data.page - 1)} className="px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)', background: 'var(--pz-surface)' }}>Prev</button>
            <button disabled={data.page >= data.totalPages} onClick={() => goToPage(data.page + 1)} className="px-3 py-1 rounded border disabled:opacity-40" style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)', background: 'var(--pz-surface)' }}>Next</button>
          </div>
        </div>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <form
            onSubmit={handleAdd}
            className="rounded-xl border p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--pz-surface)', borderColor: 'var(--pz-border)' }}
          >
            <h2 className="font-semibold" style={{ color: 'var(--pz-text)' }}>Add Attendee</h2>
            <input
              required
              placeholder="Full name"
              value={addForm.attendeeName}
              onChange={e => setAddForm(f => ({ ...f, attendeeName: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)' }}
            />
            <input
              required
              type="email"
              placeholder="Email"
              value={addForm.attendeeEmail}
              onChange={e => setAddForm(f => ({ ...f, attendeeEmail: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)' }}
            />
            {tickets.length > 1 && (
              <select
                value={addForm.ticketTypeId}
                onChange={e => setAddForm(f => ({ ...f, ticketTypeId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-text)' }}
              >
                {tickets.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 text-sm rounded-lg border"
                style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-muted)' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adding}
                className="px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
              >
                {adding ? 'Adding…' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
