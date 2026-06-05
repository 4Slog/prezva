'use client'

import { useState } from 'react'
import { addSpeakerFromLibrary } from '@/lib/speaker/speaker-actions'

type Props = {
  speakers: any[]
  events: any[]
}

export function SpeakerLibraryClient({ speakers, events }: Props) {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [addResult, setAddResult] = useState<Record<string, string>>({})
  const [selectedEvent, setSelectedEvent] = useState<Record<string, string>>({})

  const filtered = speakers.filter(sp =>
    !search.trim() ||
    sp.name?.toLowerCase().includes(search.toLowerCase()) ||
    sp.email?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAdd(orgSpeakerId: string) {
    const eventId = selectedEvent[orgSpeakerId]
    if (!eventId) {
      setAddResult(prev => ({ ...prev, [orgSpeakerId]: 'Select an event first' }))
      return
    }
    setAdding(orgSpeakerId)
    const result = await addSpeakerFromLibrary(eventId, orgSpeakerId)
    setAddResult(prev => ({
      ...prev,
      [orgSpeakerId]: (result as any).error ?? 'Added to event!',
    }))
    setAdding(null)
  }

  if (speakers.length === 0) {
    return (
      <div className="pz-card p-8 text-center">
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          No speakers yet. Speakers who confirm their invitation are automatically added to your library.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input
        className="pz-input w-full max-w-sm text-sm"
        placeholder="Search by name or email…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="pz-card overflow-hidden">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--pz-border)' }}>
              {['Name', 'Title / Company', 'Times Spoken', 'Last Spoken', 'Add to Event'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11,
                                     fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                                     color: 'var(--pz-muted)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((sp: any) => (
              <tr key={sp.id} style={{ borderBottom: '1px solid var(--pz-border)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)', margin: 0 }}>{sp.name}</p>
                  {sp.email && <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>{sp.email}</p>}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <p style={{ fontSize: 12, color: 'var(--pz-text)', margin: 0 }}>
                    {[sp.job_title, sp.company].filter(Boolean).join(', ') || '—'}
                  </p>
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--pz-text)' }}>
                  {sp.times_spoken ?? 0}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--pz-muted)' }}>
                  {sp.last_spoken_at ? new Date(sp.last_spoken_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <select
                      value={selectedEvent[sp.id] ?? ''}
                      onChange={e => setSelectedEvent(prev => ({ ...prev, [sp.id]: e.target.value }))}
                      style={{ fontSize: 12, padding: '3px 8px', borderRadius: 5, border: '1px solid var(--pz-border)',
                               background: 'var(--pz-surface)', color: 'var(--pz-text)' }}
                    >
                      <option value="">Select event…</option>
                      {events.map((ev: any) => (
                        <option key={ev.id} value={ev.id}>{ev.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAdd(sp.id)}
                      disabled={adding === sp.id}
                      style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5,
                               background: 'var(--pz-teal)', color: 'var(--pz-surface)', border: 'none',
                               cursor: 'pointer', opacity: adding === sp.id ? 0.6 : 1 }}
                    >
                      {adding === sp.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                  {addResult[sp.id] && (
                    <p style={{ fontSize: 11, marginTop: 3, color: addResult[sp.id] === 'Added to event!' ? 'var(--pz-success)' : 'var(--pz-error, var(--pz-error))' }}>
                      {addResult[sp.id]}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>No results for &ldquo;{search}&rdquo;</p>
          </div>
        )}
      </div>
    </div>
  )
}
