'use client'

import { useState, useEffect } from 'react'
import { checkInForSession, getSessionCheckIns } from '@/lib/checkin/sprint7-actions'
import { searchAttendeesForCheckIn } from '@/lib/checkin/actions'

interface Session { id: string; title: string; starts_at: string }
interface CheckInRecord { id: string; attendee_name: string; ticket_name: string; checked_in_at: string }
interface SearchResult { id: string; attendee_name: string; ticket_name: string; checked_in: boolean }

export function SessionCheckInClient({
  eventId,
  sessions,
}: {
  eventId: string
  sessions: Session[]
}) {
  const [selectedSession, setSelectedSession] = useState<string>(sessions[0]?.id ?? '')
  const [records, setRecords] = useState<CheckInRecord[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedSession) return
    let cancelled = false
    getSessionCheckIns(eventId, selectedSession).then(r => {
      if (!cancelled) { setRecords(r); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [selectedSession, eventId])

  async function handleSearch() {
    if (query.length < 2) return
    setSearching(true)
    const data = await searchAttendeesForCheckIn(eventId, query)
    setResults(data as SearchResult[])
    setSearching(false)
  }

  async function handleCheckIn(registrationId: string) {
    if (!selectedSession) return
    const result = await checkInForSession(eventId, selectedSession, registrationId)
    if (!result.error) {
      const fresh = await getSessionCheckIns(eventId, selectedSession)
      setRecords(fresh)
      setResults(prev => prev.map(a => a.id === registrationId ? { ...a, checked_in: true } : a))
    }
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="space-y-6">
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Session</label>
        <select
          value={selectedSession}
          onChange={e => setSelectedSession(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
        >
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.title} — {new Date(s.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </option>
          ))}
        </select>
      </div>

      <div className="pz-card p-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Check in attendee</h3>
        <div className="flex gap-2 mb-3">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Search name or email…"
            className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Search
          </button>
        </div>
        {results.length > 0 && (
          <div className="divide-y divide-[var(--pz-border)] rounded-lg border border-[var(--pz-border)] overflow-hidden">
            {results.map(a => (
              <div key={a.id} className="flex items-center justify-between px-3 py-2.5" style={{ background: 'var(--pz-surface)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{a.attendee_name}</p>
                  <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{a.ticket_name}</p>
                </div>
                <button
                  onClick={() => handleCheckIn(a.id)}
                  disabled={a.checked_in}
                  className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-40"
                  style={{
                    background: a.checked_in ? 'var(--pz-surface-2)' : 'var(--pz-teal)',
                    color: a.checked_in ? 'var(--pz-muted)' : '#0D1B2A',
                  }}
                >
                  {a.checked_in ? 'Done' : 'Check In'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>
          Checked in — {records.length} attendee{records.length !== 1 ? 's' : ''}
        </h3>
        {loading ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--pz-muted)' }}>Loading…</p>
        ) : records.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--pz-muted)' }}>No check-ins for this session yet.</p>
        ) : (
          <div className="divide-y divide-[var(--pz-border)] rounded-lg border border-[var(--pz-border)] overflow-hidden">
            {records.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--pz-surface)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{r.attendee_name}</p>
                  <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{r.ticket_name}</p>
                </div>
                <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                  {new Date(r.checked_in_at).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
