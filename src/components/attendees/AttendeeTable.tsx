'use client'

import { useState } from 'react'
import type { AttendeeWithTicket, AttendeeFilters } from '@/lib/attendees/actions'

interface AttendeeTableProps {
  attendees: AttendeeWithTicket[]
  total: number
  page: number
  totalPages: number
  eventId: string
  onFilterChange: (f: Partial<AttendeeFilters>) => void
  onRemove: (id: string) => Promise<void>
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  confirmed:  { bg: 'rgba(34,197,94,0.15)',  color: 'var(--pz-success)' },
  waitlisted: { bg: 'rgba(245,158,11,0.15)', color: 'var(--pz-warning)' },
  cancelled:  { bg: 'rgba(239,68,68,0.15)',  color: 'var(--pz-error)'   },
}

const inputStyle = {
  background: 'var(--pz-surface)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
}

export function AttendeeTable({
  attendees, total, page, totalPages, eventId, onFilterChange, onRemove,
}: AttendeeTableProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  function apply() {
    onFilterChange({ search: search || undefined, status: status || undefined, page: 1 })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && apply()}
            className="w-56 rounded-md px-3 py-1.5 text-sm focus:outline-none"
            style={inputStyle}
          />
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); onFilterChange({ status: e.target.value || undefined, page: 1 }) }}
            className="rounded-md px-3 py-1.5 text-sm focus:outline-none"
            style={inputStyle}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={apply}
            className="rounded-md px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Search
          </button>
        </div>
        <a
          href={`/api/events/${eventId}/attendees/export`}
          target="_blank"
          className="rounded-md px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
        >
          Export CSV
        </a>
      </div>

      <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
        {total} attendee{total !== 1 ? 's' : ''}
      </p>

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--pz-border)' }}>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--pz-surface-2)' }}>
            <tr>
              {['Name', 'Email', 'Ticket', 'Status', 'Checked In', 'Paid', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--pz-muted)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {attendees.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm" style={{ color: 'var(--pz-muted)' }}>
                  No attendees found
                </td>
              </tr>
            )}
            {attendees.map(a => {
              const sc = STATUS_STYLE[a.status] ?? STATUS_STYLE.cancelled
              return (
                <tr
                  key={a.id}
                  style={{ borderTop: '1px solid var(--pz-border)' }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--pz-text)' }}>{a.attendee_name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--pz-muted)' }}>{a.attendee_email}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--pz-muted)' }}>{a.ticket_name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: sc.bg, color: sc.color }}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--pz-muted)' }}>
                    {a.checked_in
                      ? <span style={{ color: 'var(--pz-success)' }}>✓ {a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString() : ''}</span>
                      : '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--pz-muted)' }}>
                    {a.amount_paid_cents > 0 ? '$' + (a.amount_paid_cents / 100).toFixed(2) : 'Free'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => { if (confirm('Cancel this registration?')) onRemove(a.id) }}
                      className="text-xs hover:underline"
                      style={{ color: 'var(--pz-error)' }}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--pz-muted)' }}>
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onFilterChange({ page: page - 1 })}
              className="rounded px-3 py-1 disabled:opacity-40"
              style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onFilterChange({ page: page + 1 })}
              className="rounded px-3 py-1 disabled:opacity-40"
              style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
