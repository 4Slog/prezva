'use client'
import { useState, useTransition } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { createPassportLocation, deletePassportLocation } from '@/lib/engagement/passport-admin-actions'

interface Location { id: string; name: string; code: string; points: number; created_at: string }
interface LeaderEntry { userId?: string; registrationId?: string; name: string; count: number; totalPoints: number }

interface Props {
  eventId: string
  initialLocations: Location[]
  totalStamps: number
  leaderboard: LeaderEntry[]
}

export default function PassportAdminClient({ eventId, initialLocations, totalStamps, leaderboard }: Props) {
  const [locations, setLocations] = useState(initialLocations)
  const [name, setName] = useState('')
  const [points, setPoints] = useState('5')
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const inputCls = 'px-3 py-2 border border-[var(--pz-border)] rounded-lg bg-[var(--pz-bg)] text-sm text-[var(--pz-text)] w-full'

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    startTransition(async () => {
      const result = await createPassportLocation(eventId, name.trim(), parseInt(points) || 5)
      if (result.error) { setError(result.error); return }
      setLocations(prev => [...prev, result.data as Location])
      setName('')
      setPoints('5')
    })
  }

  function handleDelete(locationId: string) {
    startTransition(async () => {
      const result = await deletePassportLocation(locationId, eventId)
      if (!result.error) setLocations(prev => prev.filter(l => l.id !== locationId))
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="pz-card p-5">
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Stamps</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--pz-teal)', marginTop: 4 }}>{totalStamps}</p>
        </div>
        <div className="pz-card p-5">
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Locations</p>
          <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--pz-teal)', marginTop: 4 }}>{locations.length}</p>
        </div>
      </div>

      {/* Add location */}
      <div className="pz-card p-6">
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Add Location</h2>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 4 }}>Location Name</label>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Registration Desk" required />
          </div>
          <div style={{ width: 80 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 4 }}>Points</label>
            <input type="number" min="1" max="100" className={inputCls} value={points} onChange={e => setPoints(e.target.value)} />
          </div>
          <button type="submit" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--pz-teal)', color: '#fff', border: 'none', borderRadius: 8, padding: '0.55rem 1rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Plus size={14} /> Add
          </button>
        </form>
        {error && <p style={{ color: '#EF4444', fontSize: 12, marginTop: 8 }}>{error}</p>}
      </div>

      {/* Locations list */}
      <div className="pz-card p-6">
        <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Locations</h2>
        {locations.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>No locations yet. Add one above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {locations.map(loc => (
              <div key={loc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--pz-border)', borderRadius: 8 }}>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{loc.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginTop: 2 }}>
                    Code: <span style={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}>{loc.code}</span>
                    <span style={{ marginLeft: 12 }}>{loc.points} pt{loc.points !== 1 ? 's' : ''}</span>
                  </p>
                </div>
                <button onClick={() => handleDelete(loc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="pz-card p-6">
          <h2 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>Top Collectors</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaderboard.map((entry, i) => (
              <div key={entry.userId ?? entry.registrationId ?? i} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14 }}>
                <span style={{ fontWeight: 700, color: 'var(--pz-muted)', width: 20, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ flex: 1 }}>{entry.name}</span>
                <span style={{ fontWeight: 600, color: 'var(--pz-teal)' }}>{entry.count} stamp{entry.count !== 1 ? 's' : ''} · {entry.totalPoints} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
