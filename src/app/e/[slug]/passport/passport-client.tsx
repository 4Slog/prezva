'use client'

import { useState } from 'react'
import { checkInPassportLocation } from '@/lib/engagement/sprint10-actions'

type Props = {
  eventId: string
  locations: any[]
  initialVisitedIds: string[]
}

export function PassportClient({ eventId, locations, initialVisitedIds }: Props) {
  const [visitedIds, setVisitedIds] = useState(new Set(initialVisitedIds))
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  async function checkIn() {
    if (!code.trim()) return
    setPending(true)
    setMessage('')
    const result = await checkInPassportLocation(eventId, code)
    if ((result as any).error) {
      setMessage((result as any).error)
    } else {
      const loc = locations.find(l => l.code === code.trim().toUpperCase())
      if (loc) setVisitedIds(prev => new Set(prev).add(loc.id))
      setMessage(`Checked in to ${(result as any).location}! +${(result as any).points} pts`)
      setCode('')
    }
    setPending(false)
  }

  const totalPossible = locations.reduce((s, l) => s + l.points, 0)
  const earnedPoints = locations.filter(l => visitedIds.has(l.id)).reduce((s, l) => s + l.points, 0)

  return (
    <div>
      {/* Progress */}
      <div className="pz-card p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-text)' }}>
            {visitedIds.size} / {locations.length} locations visited
          </p>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-teal)' }}>{earnedPoints} / {totalPossible} pts</p>
        </div>
        <div style={{ background: 'var(--pz-surface-2)', borderRadius: 8, height: 8, overflow: 'hidden' }}>
          <div style={{ background: 'var(--pz-teal)', height: '100%', width: `${locations.length > 0 ? (visitedIds.size / locations.length) * 100 : 0}%`, transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Code entry */}
      <div className="pz-card p-4 mb-6">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--pz-label)', marginBottom: 8 }}>Enter booth code</p>
        <div className="flex gap-2">
          <input
            className="pz-input flex-1 text-sm font-mono uppercase"
            placeholder="CODE"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') checkIn() }}
            maxLength={20}
          />
          <button onClick={checkIn} disabled={pending || !code.trim()} className="pz-btn-primary text-sm px-4">
            {pending ? '…' : 'Check in'}
          </button>
        </div>
        {message && (
          <p style={{ fontSize: 12, marginTop: 8, color: message.startsWith('Checked') ? 'var(--pz-success)' : 'var(--pz-error, #ef4444)' }}>
            {message}
          </p>
        )}
      </div>

      {/* Locations list */}
      <div className="space-y-2">
        {locations.map(loc => (
          <div key={loc.id} className="pz-card p-3 flex items-center gap-3">
            <span style={{ fontSize: 18 }}>{visitedIds.has(loc.id) ? '✅' : '⬜'}</span>
            <div className="flex-1 min-w-0">
              <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--pz-text)' }}>{loc.name}</p>
              <p style={{ fontSize: 11, color: 'var(--pz-muted)' }}>+{loc.points} pts</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
