'use client'

import { useState, useCallback } from 'react'
import { SessionForm } from '@/components/agenda/SessionForm'
import { AgendaGrid } from '@/components/agenda/AgendaGrid'
import { createSession, updateSession, deleteSession } from '@/lib/agenda/actions'
import type { Session, Track, Room, Speaker } from '@/lib/agenda/actions'

interface AgendaClientProps {
  eventId: string
  initialSessions: Session[]
  tracks: Track[]
  rooms: Room[]
  speakers: Speaker[]
}

export function AgendaClient({ eventId, initialSessions, tracks, rooms, speakers }: AgendaClientProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [editing, setEditing] = useState<Session | null>(null)
  const [showForm, setShowForm] = useState(false)

  const reload = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/agenda/sessions`)
    const data = await res.json()
    setSessions(data)
  }, [eventId])

  async function handleSave(data: Record<string, any>) {
    if (editing) {
      await updateSession(eventId, editing.id, data)
    } else {
      await createSession(eventId, data)
    }
    await reload()
    setShowForm(false)
    setEditing(null)
  }

  async function handleDelete(sessionId: string) {
    if (!confirm('Delete this session?')) return
    await deleteSession(eventId, sessionId)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
  }

  function handleEdit(session: Session) {
    setEditing(session)
    setShowForm(true)
  }

  function handleCancel() {
    setEditing(null)
    setShowForm(false)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agenda</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-lg hover:opacity-90"
          >
            + Add Session
          </button>
        )}
      </div>

      {/* Track legend */}
      {tracks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tracks.map(t => (
            <span key={t.id} className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
            {editing ? 'Edit Session' : 'New Session'}
          </h2>
          <SessionForm
            eventId={eventId}
            tracks={tracks}
            rooms={rooms}
            speakers={speakers}
            session={editing}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      <AgendaGrid
        sessions={sessions}
        tracks={tracks}
        rooms={rooms}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}
