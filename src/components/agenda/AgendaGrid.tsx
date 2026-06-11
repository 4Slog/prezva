'use client'

import { useState } from 'react'
import { Pencil, ScanLine, X } from 'lucide-react'
import type { Session, Track, Room } from '@/lib/agenda/actions'

interface AgendaGridProps {
  sessions: Session[]
  tracks: Track[]
  rooms: Room[]
  timezone?: string
  onEdit: (session: Session) => void
  onDelete: (sessionId: string) => void
  orgId?: string
  zoomConnected?: boolean
  teamsConnected?: boolean
  onSessionUpdated?: () => void
  typeColors?: Record<string, string>
  getCheckinHref?: (sessionId: string) => string
}

function MeetingButton({ label, sessionId, orgId, provider, onDone }: {
  label: string; sessionId: string; orgId: string; provider: 'zoom' | 'teams'; onDone: () => void
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await fetch(`/api/integrations/${provider}/create-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, sessionId }),
    })
    setLoading(false)
    onDone()
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-2 py-0.5 rounded text-xs font-medium border border-current opacity-70 hover:opacity-100 disabled:opacity-40 transition-opacity"
      title={label}
    >
      {loading ? '…' : label}
    </button>
  )
}

export function AgendaGrid({ sessions, tracks, rooms, timezone = 'UTC', onEdit, onDelete, orgId, zoomConnected, teamsConnected, onSessionUpdated, typeColors = {}, getCheckinHref }: AgendaGridProps) {
  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: timezone })

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' })

  const byDate: Record<string, Session[]> = {}
  for (const s of sessions) {
    const day = fmtDay(s.starts_at)
    if (!byDate[day]) byDate[day] = []
    byDate[day].push(s)
  }
  const days = Object.keys(byDate).sort()

  const TYPE_COLORS: Record<string, string> = {
    talk: 'bg-blue-50 border-blue-200 text-blue-800',
    workshop: 'bg-purple-50 border-purple-200 text-purple-800',
    panel: 'bg-amber-50 border-amber-200 text-amber-800',
    keynote: 'bg-green-50 border-green-200 text-green-800',
    break: 'bg-gray-50 border-gray-200 text-gray-600',
    networking: 'bg-pink-50 border-pink-200 text-pink-800',
    other: 'bg-slate-50 border-slate-200 text-slate-700',
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--pz-muted)]">
        <p className="text-sm">No sessions yet. Add your first session above.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {days.map(day => (
        <div key={day}>
          <h3 className="text-sm font-semibold text-[var(--pz-muted)] mb-3">
            {new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          <div className="space-y-2">
            {byDate[day].map(s => {
              const customHex = typeColors[s.session_type]
              return (
              <div
                key={s.id}
                className={customHex ? 'flex items-start gap-3 p-3 rounded-xl border' : 'flex items-start gap-3 p-3 rounded-xl border ' + (TYPE_COLORS[s.session_type] ?? TYPE_COLORS.other)}
                style={customHex ? { backgroundColor: customHex + '22', borderColor: customHex, color: customHex } : undefined}
              >
                {/* Time */}
                <div className="text-xs font-mono shrink-0 pt-0.5 opacity-80">
                  {fmtTime(s.starts_at)}
                  <br />
                  {fmtTime(s.ends_at)}
                </div>

                {/* Track color dot */}
                {s.track && (
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                    style={{ backgroundColor: s.track.color }}
                  />
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.title}</p>
                  <div className="flex flex-wrap gap-2 mt-1 text-xs opacity-75">
                    <span className="capitalize">{s.session_type}</span>
                    {s.track && <span>· {s.track.name}</span>}
                    {s.room && <span>· {s.room.name}</span>}
                    {s.speakers && s.speakers.length > 0 && (
                      <span>· {s.speakers.map(sp => sp.name).join(', ')}</span>
                    )}
                  </div>
                  {(s as any).virtual_url && (
                    <a
                      href={(s as any).virtual_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 text-xs underline opacity-70 hover:opacity-100 block truncate"
                    >
                      Join link
                    </a>
                  )}
                  {orgId && !(s as any).virtual_url && (zoomConnected || teamsConnected) && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {zoomConnected && (
                        <MeetingButton label="Zoom" sessionId={s.id} orgId={orgId} provider="zoom" onDone={onSessionUpdated ?? (() => {})} />
                      )}
                      {teamsConnected && (
                        <MeetingButton label="Teams" sessionId={s.id} orgId={orgId} provider="teams" onDone={onSessionUpdated ?? (() => {})} />
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  {getCheckinHref && (
                    <a
                      href={getCheckinHref(s.id)}
                      className="p-1 rounded hover:bg-black/10 text-xs"
                      title="Check-in"
                    >
                      <ScanLine size={14} />
                    </a>
                  )}
                  <button
                    onClick={() => onEdit(s)}
                    className="p-1 rounded hover:bg-black/10 text-xs"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1 rounded hover:bg-black/10 text-xs"
                    title="Delete"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
