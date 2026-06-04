'use client'

import { useState, useCallback } from 'react'
import { searchAttendeesForCheckIn } from '@/lib/checkin/actions'

interface ManualSearchProps {
  eventId: string
  onCheckIn: (registrationId: string) => void
}

interface AttendeeRow {
  id: string
  attendee_name: string
  attendee_email: string
  ticket_name: string
  delivery_method: string
  checked_in: boolean
  check_in_time: string | null
}

type DeliveryFilter = 'all' | 'in_person' | 'virtual'

export function ManualSearch({ eventId, onCheckIn }: ManualSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AttendeeRow[]>([])
  const [searching, setSearching] = useState(false)
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all')

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    setSearching(true)
    const data = await searchAttendeesForCheckIn(eventId, q)
    setResults(data as AttendeeRow[])
    setSearching(false)
  }, [eventId])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value
    setQuery(q)
    search(q)
  }

  const filtered = deliveryFilter === 'all'
    ? results
    : results.filter(r => r.delivery_method === deliveryFilter)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <select
          value={deliveryFilter}
          onChange={e => setDeliveryFilter(e.target.value as DeliveryFilter)}
          className="px-3 py-2 border border-[var(--pz-border)] rounded-lg bg-[var(--pz-bg)] text-[var(--pz-text)] text-xs"
        >
          <option value="in_person">📍 In-person</option>
          <option value="virtual">💻 Virtual</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={query}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-[var(--pz-border)] rounded-lg bg-[var(--pz-bg)] text-[var(--pz-text)] text-sm placeholder:text-[var(--pz-muted)]"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-3 text-xs text-[var(--pz-muted)] animate-pulse">
            searching…
          </span>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="divide-y divide-[var(--pz-border)] rounded-lg border border-[var(--pz-border)] overflow-hidden">
          {filtered.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-4 py-3 bg-[var(--pz-surface)] hover:bg-[var(--pz-surface-2)] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[var(--pz-text)]">{r.attendee_name}</p>
                <p className="text-xs text-[var(--pz-muted)]">
                  {r.attendee_email} · {r.ticket_name}
                  {r.delivery_method === 'virtual' && ' · 💻'}
                </p>
              </div>
              {r.checked_in ? (
                <span className="text-xs text-green-600 font-medium">✓ Checked in</span>
              ) : (
                <button
                  onClick={() => onCheckIn(r.id)}
                  className="px-3 py-1.5 text-xs bg-[var(--pz-teal)] text-white rounded-md hover:opacity-90"
                >
                  Check in
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !searching && filtered.length === 0 && (
        <p className="text-sm text-[var(--pz-muted)] text-center py-4">
          {results.length > 0 ? `No ${deliveryFilter === 'in_person' ? 'in-person' : 'virtual'} attendees found` : 'No attendees found'}
        </p>
      )}
    </div>
  )
}
