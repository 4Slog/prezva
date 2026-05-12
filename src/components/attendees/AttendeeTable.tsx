'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AttendeeWithTicket, AttendeeFilters } from '@/lib/attendees/actions'

interface AttendeeTableProps {
  attendees: AttendeeWithTicket[]
  total: number
  page: number
  totalPages: number
  eventId: string
  eventSlug?: string
  onFilterChange: (f: Partial<AttendeeFilters>) => void
  onRemove: (id: string) => Promise<void>
}

export function AttendeeTable({
  attendees, total, page, totalPages, eventId, eventSlug, onFilterChange, onRemove,
}: AttendeeTableProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  function apply() {
    onFilterChange({ search: search || undefined, status: status || undefined, page: 1 })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && apply()}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md bg-[var(--bg-card)] text-[var(--text-primary)] w-56"
          />
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); onFilterChange({ status: e.target.value || undefined, page: 1 }) }}
            className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md bg-[var(--bg-card)] text-[var(--text-primary)]"
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={apply}
            className="px-3 py-1.5 text-sm bg-[var(--brand-teal)] text-white rounded-md hover:opacity-90"
          >
            Search
          </button>
        </div>
        <a
          href={`/api/events/${eventId}/attendees/export`}
          target="_blank"
          className="px-3 py-1.5 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]"
        >
          Export CSV
        </a>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">
        {total} attendee{total !== 1 ? 's' : ''}
      </p>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-xs uppercase">
            <tr>
              {['Name', 'Email', 'Ticket', 'Status', 'Checked In', 'Paid', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {attendees.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  No attendees found
                </td>
              </tr>
            )}
            {attendees.map(a => (
              <tr key={a.id} className="hover:bg-[var(--bg-hover)] transition-colors">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                  {eventSlug ? (
                    <Link href={`/events/${eventSlug}/attendees/${a.id}`} style={{ color: 'var(--pz-teal)', textDecoration: 'none' }}>
                      {a.attendee_name}
                    </Link>
                  ) : a.attendee_name}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{a.attendee_email}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{a.ticket_name}</td>
                <td className="px-4 py-3">
                  <span className={
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ' +
                    (a.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                     a.status === 'waitlisted' ? 'bg-yellow-100 text-yellow-800' :
                     'bg-red-100 text-red-800')
                  }>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                  {a.checked_in
                    ? '✓ ' + (a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString() : '')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">
                  {a.amount_paid_cents > 0 ? '$' + (a.amount_paid_cents / 100).toFixed(2) : 'Free'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => { if (confirm('Cancel this registration?')) onRemove(a.id) }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onFilterChange({ page: page - 1 })}
              className="px-3 py-1 border border-[var(--border)] rounded disabled:opacity-40 hover:bg-[var(--bg-hover)]"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onFilterChange({ page: page + 1 })}
              className="px-3 py-1 border border-[var(--border)] rounded disabled:opacity-40 hover:bg-[var(--bg-hover)]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
