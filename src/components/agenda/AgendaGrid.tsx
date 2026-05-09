'use client'

import type { Session, Track, Room } from '@/lib/agenda/actions'

interface AgendaGridProps {
  sessions: Session[]
  tracks: Track[]
  rooms: Room[]
  onEdit: (session: Session) => void
  onDelete: (sessionId: string) => void
}

export function AgendaGrid({ sessions, tracks, rooms, onEdit, onDelete }: AgendaGridProps) {
  // Group sessions by date
  const byDate: Record<string, Session[]> = {}
  for (const s of sessions) {
    const day = s.starts_at.slice(0, 10)
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
      <div className="text-center py-12 text-[var(--text-muted)]">
        <p className="text-sm">No sessions yet. Add your first session above.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {days.map(day => (
        <div key={day}>
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3">
            {new Date(day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </h3>
          <div className="space-y-2">
            {byDate[day].map(s => (
              <div
                key={s.id}
                className={'flex items-start gap-3 p-3 rounded-xl border ' + (TYPE_COLORS[s.session_type] ?? TYPE_COLORS.other)}
              >
                {/* Time */}
                <div className="text-xs font-mono shrink-0 pt-0.5 opacity-80">
                  {new Date(s.starts_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  <br />
                  {new Date(s.ends_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
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
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onEdit(s)}
                    className="p-1 rounded hover:bg-black/10 text-xs"
                    title="Edit"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1 rounded hover:bg-black/10 text-xs"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
