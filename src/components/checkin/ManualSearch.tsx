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
  checked_in: boolean
  check_in_time: string | null
}

export function ManualSearch({ eventId, onCheckIn }: ManualSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AttendeeRow[]>([])
  const [searching, setSearching] = useState(false)

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

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or email…"
          value={query}
          onChange={handleChange}
          className="w-full px-4 py-2.5 border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)]"
          autoComplete="off"
        />
        {searching && (
          <span className="absolute right-3 top-3 text-xs text-[var(--text-muted)] animate-pulse">
            searching…
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] overflow-hidden">
          {results.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{r.attendee_name}</p>
                <p className="text-xs text-[var(--text-muted)]">{r.attendee_email} · {r.ticket_name}</p>
              </div>
              {r.checked_in ? (
                <span className="text-xs text-green-600 font-medium">✓ Checked in</span>
              ) : (
                <button
                  onClick={() => onCheckIn(r.id)}
                  className="px-3 py-1.5 text-xs bg-[var(--brand-teal)] text-white rounded-md hover:opacity-90"
                >
                  Check in
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="text-sm text-[var(--text-muted)] text-center py-4">No attendees found</p>
      )}
    </div>
  )
}
