'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)

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
            className="px-3 py-1.5 text-sm border border-[var(--pz-border)] rounded-md bg-[var(--pz-surface)] text-[var(--pz-text)] w-56"
          />
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); onFilterChange({ status: e.target.value || undefined, page: 1 }) }}
            className="px-3 py-1.5 text-sm border border-[var(--pz-border)] rounded-md bg-[var(--pz-surface)] text-[var(--pz-text)]"
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button
            onClick={apply}
            className="px-3 py-1.5 text-sm bg-[var(--brand-teal)] text-[var(--pz-on-accent)] rounded-md hover:opacity-90"
          >
            Search
          </button>
        </div>
        <a
          href={`/api/events/${eventId}/attendees/export`}
          target="_blank"
          className="px-3 py-1.5 text-sm border border-[var(--pz-border)] rounded-md hover:bg-[var(--pz-surface-2)] text-[var(--pz-muted)]"
        >
          Export CSV
        </a>
      </div>

      <p className="text-sm text-[var(--pz-muted)]">
        {total} attendee{total !== 1 ? 's' : ''}
      </p>

      <div className="overflow-x-auto rounded-lg border border-[var(--pz-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--pz-bg)] text-[var(--pz-muted)] text-xs uppercase">
            <tr>
              {['Name', 'Email', 'Ticket', 'Status', 'Checked In', 'Paid', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--pz-border)]">
            {attendees.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--pz-muted)]">
                  No attendees found
                </td>
              </tr>
            )}
            {attendees.map(a => (
              <tr
                key={a.id}
                className="hover:bg-[var(--pz-surface-2)] transition-colors"
                style={{ cursor: eventSlug ? 'pointer' : 'default' }}
                onClick={(e) => {
                  if (!eventSlug) return
                  // Don't navigate if clicking a button or link within the row
                  if ((e.target as HTMLElement).closest('button, a')) return
                  router.push(`/events/${eventSlug}/attendees/${a.id}`)
                }}
              >
                <td className="px-4 py-3 font-medium text-[var(--pz-text)]">
                  {eventSlug ? (
                    <span style={{ color: 'var(--pz-teal)' }}>{a.attendee_name}</span>
                  ) : a.attendee_name}
                </td>
                <td className="px-4 py-3 text-[var(--pz-muted)]">{a.attendee_email}</td>
                <td className="px-4 py-3 text-[var(--pz-muted)]">{a.ticket_name}</td>
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
                <td className="px-4 py-3 text-xs text-[var(--pz-muted)]">
                  {a.checked_in
                    ? '✓ ' + (a.check_in_time ? new Date(a.check_in_time).toLocaleTimeString() : '')
                    : '—'}
                </td>
                <td className="px-4 py-3 text-[var(--pz-muted)]">
                  {(() => {
                    const amt = a.amount_paid_cents ?? 0
                    const method = (a as any).payment_method ?? 'online'
                    if (amt > 0) return '$' + (amt / 100).toFixed(2)
                    if (method === 'comp') return 'Comp'
                    if (method === 'cash') return 'Cash (paid)'
                    if (method === 'card') return 'Card (paid)'
                    if (method === 'invoice') return 'Invoice'
                    return 'Free'
                  })()}
                </td>
                <td className="px-4 py-3">
                  {cancelId === a.id ? (
                    <span className="flex items-center gap-1 text-xs">
                      <span className="text-[var(--pz-muted)]">Cancel registration?</span>
                      <button
                        onClick={() => { onRemove(a.id); setCancelId(null) }}
                        className="text-red-500 hover:text-red-700 font-medium"
                      >Yes</button>
                      <button
                        onClick={() => setCancelId(null)}
                        className="text-[var(--pz-muted)] hover:text-[var(--pz-text)]"
                      >No</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setCancelId(a.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-[var(--pz-muted)]">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onFilterChange({ page: page - 1 })}
              className="px-3 py-1 border border-[var(--pz-border)] rounded disabled:opacity-40 hover:bg-[var(--pz-surface-2)]"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onFilterChange({ page: page + 1 })}
              className="px-3 py-1 border border-[var(--pz-border)] rounded disabled:opacity-40 hover:bg-[var(--pz-surface-2)]"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
