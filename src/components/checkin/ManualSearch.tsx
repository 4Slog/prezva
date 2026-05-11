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
          autoComplete="off"
          className="w-full rounded-lg px-4 py-2.5 text-sm focus:outline-none"
          style={{
            background: 'var(--pz-surface-2)',
            border: '1px solid var(--pz-border)',
            color: 'var(--pz-text)',
          }}
        />
        {searching && (
          <span className="absolute right-3 top-3 animate-pulse text-xs" style={{ color: 'var(--pz-muted)' }}>
            searching…
          </span>
        )}
      </div>

      {results.length > 0 && (
        <div className="overflow-hidden rounded-lg" style={{ border: '1px solid var(--pz-border)' }}>
          {results.map(r => (
            <div
              key={r.id}
              className="flex items-center justify-between px-4 py-3 transition-colors"
              style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)' }}
            >
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{r.attendee_name}</p>
                <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{r.attendee_email} · {r.ticket_name}</p>
              </div>
              {r.checked_in ? (
                <span className="text-xs font-medium" style={{ color: 'var(--pz-success)' }}>✓ Checked in</span>
              ) : (
                <button
                  onClick={() => onCheckIn(r.id)}
                  className="rounded-md px-3 py-1.5 text-xs transition-opacity hover:opacity-90"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  Check in
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="py-4 text-center text-sm" style={{ color: 'var(--pz-muted)' }}>No attendees found</p>
      )}
    </div>
  )
}
