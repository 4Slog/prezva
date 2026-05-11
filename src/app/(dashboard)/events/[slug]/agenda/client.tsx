'use client'

import { useState, useCallback } from 'react'
import { SessionForm } from '@/components/agenda/SessionForm'
import { AgendaGrid } from '@/components/agenda/AgendaGrid'
import { createSession, updateSession, deleteSession } from '@/lib/agenda/actions'
import {
  checkSessionConflicts,
  bulkShiftSessions,
  bulkAssignSessions,
} from '@/lib/agenda/sprint6-actions'
import type { Session, Track, Room, Speaker } from '@/lib/agenda/actions'

interface TicketTypeSummary {
  id: string
  name: string
}

interface AgendaClientProps {
  eventId: string
  timezone: string
  initialSessions: Session[]
  tracks: Track[]
  rooms: Room[]
  speakers: Speaker[]
  ticketTypes: TicketTypeSummary[]
}

export function AgendaClient({ eventId, timezone, initialSessions, tracks, rooms, speakers, ticketTypes }: AgendaClientProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [editing, setEditing] = useState<Session | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [conflictWarning, setConflictWarning] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkShiftMin, setBulkShiftMin] = useState('30')
  const [bulkRoomId, setBulkRoomId] = useState('')
  const [bulkTrackId, setBulkTrackId] = useState('')
  const [bulkPending, setBulkPending] = useState(false)

  const reload = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/agenda/sessions`)
    const data = await res.json()
    setSessions(data)
  }, [eventId])

  async function handleSave(data: Record<string, any>) {
    setConflictWarning(null)
    const conflicts = await checkSessionConflicts(eventId, {
      sessionId: editing?.id,
      roomId: data.room_id,
      speakerIds: data.speaker_ids ?? [],
      startsAt: data.starts_at,
      endsAt: data.ends_at,
    })
    if (conflicts.length > 0) {
      const types = conflicts.map(c => `${c.type}: "${c.title}"`).join('; ')
      setConflictWarning(`Scheduling conflict detected — ${types}`)
    }

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
    setSelected(prev => { const next = new Set(prev); next.delete(sessionId); return next })
  }

  function handleEdit(session: Session) {
    setEditing(session)
    setShowForm(true)
  }

  function handleCancel() {
    setEditing(null)
    setShowForm(false)
  }

  function toggleSelect(sessionId: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }

  async function handleBulkShift() {
    if (selected.size === 0) return
    setBulkPending(true)
    await bulkShiftSessions(Array.from(selected), parseInt(bulkShiftMin))
    await reload()
    setBulkPending(false)
    setSelected(new Set())
  }

  async function handleBulkAssign() {
    if (selected.size === 0) return
    setBulkPending(true)
    const updates: Record<string, string | null> = {}
    if (bulkRoomId) updates.room_id = bulkRoomId
    if (bulkTrackId) updates.track_id = bulkTrackId
    if (Object.keys(updates).length > 0) {
      await bulkAssignSessions(Array.from(selected), updates)
      await reload()
    }
    setBulkPending(false)
    setSelected(new Set())
    setBulkRoomId('')
    setBulkTrackId('')
  }

  const inputCls = 'rounded-lg px-3 py-1.5 text-xs focus:outline-none'
  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">Agenda</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 text-sm bg-[var(--pz-teal)] text-white rounded-lg hover:opacity-90"
          >
            + Add Session
          </button>
        )}
      </div>

      {/* Track legend */}
      {tracks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tracks.map(t => (
            <span key={t.id} className="flex items-center gap-1.5 text-xs text-[var(--pz-muted)]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-teal)' }}>
          <p className="text-xs font-semibold" style={{ color: 'var(--pz-teal)' }}>
            {selected.size} session{selected.size !== 1 ? 's' : ''} selected
          </p>
          <div className="flex flex-wrap gap-3">
            {/* Shift */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={bulkShiftMin}
                onChange={e => setBulkShiftMin(e.target.value)}
                className={inputCls}
                style={{ ...inputStyle, width: 80 }}
                placeholder="min"
              />
              <button
                onClick={handleBulkShift}
                disabled={bulkPending}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                Shift {bulkShiftMin}min
              </button>
            </div>
            {/* Assign room */}
            {rooms.length > 0 && (
              <div className="flex items-center gap-2">
                <select value={bulkRoomId} onChange={e => setBulkRoomId(e.target.value)} className={inputCls} style={inputStyle}>
                  <option value="">Room…</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
            {/* Assign track */}
            {tracks.length > 0 && (
              <div className="flex items-center gap-2">
                <select value={bulkTrackId} onChange={e => setBulkTrackId(e.target.value)} className={inputCls} style={inputStyle}>
                  <option value="">Track…</option>
                  {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {(bulkRoomId || bulkTrackId) && (
              <button
                onClick={handleBulkAssign}
                disabled={bulkPending}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                Assign
              </button>
            )}
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg px-3 py-1.5 text-xs"
              style={{ color: 'var(--pz-muted)' }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {conflictWarning && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--pz-warning)' }}>
          ⚠ {conflictWarning}
        </div>
      )}

      {showForm && (
        <div className="bg-[var(--pz-surface)] border border-[var(--pz-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">
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
        timezone={timezone}
        ticketTypes={ticketTypes}
        selected={selected}
        onToggleSelect={toggleSelect}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  )
}
