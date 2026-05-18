'use client'

import { useState, useCallback, useRef } from 'react'
import { SessionForm } from '@/components/agenda/SessionForm'
import { AgendaGrid } from '@/components/agenda/AgendaGrid'
import { createSession, updateSession, deleteSession, createRoom, deleteRoom } from '@/lib/agenda/actions'
import type { Session, Track, Room, Speaker } from '@/lib/agenda/actions'

interface AgendaClientProps {
  eventId: string
  orgId: string
  timezone: string
  initialSessions: Session[]
  tracks: Track[]
  rooms: Room[]
  speakers: Speaker[]
  zoomConnected: boolean
  teamsConnected: boolean
}

const SESSION_FIELDS = [
  'title', 'description', 'starts_at', 'ends_at', 'session_type', 'track', 'room', 'speaker', 'capacity',
]

type DetectedMapping = Record<string, { field: string; confidence: number }>

function CsvImportModal({ eventId, onClose, onImported }: { eventId: string; onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [detected, setDetected] = useState<DetectedMapping>({})
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([])
  const [csvText, setCsvText] = useState('')
  const [rowCount, setRowCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [imported, setImported] = useState(0)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setCsvText(text)
    setLoading(true)
    setError('')
    const res = await fetch(`/api/events/${eventId}/agenda/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: text }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setHeaders(data.headers)
    setDetected(data.detected)
    setRowCount(data.rowCount)
    const initial: Record<string, string> = {}
    for (const h of data.headers) {
      if (data.detected[h]) initial[h] = data.detected[h].field
    }
    setColumnMap(initial)
    setStep('map')
  }

  async function handlePreview() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/events/${eventId}/agenda/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText, columnMap, preview: true }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setPreviewRows(data.rows)
    setStep('preview')
  }

  async function handleImport() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/events/${eventId}/agenda/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText, columnMap }),
    })
    const data = await res.json()
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setImported(data.imported)
    setStep('done')
    onImported()
  }

  const confidenceColor = (c: number) => c >= 1 ? '#00BFA6' : c >= 0.8 ? '#F59E0B' : '#94A3B8'
  const confidenceLabel = (c: number) => c >= 1 ? 'Exact match' : c >= 0.8 ? 'Synonym match' : 'Partial match'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#112240] border border-[#1E3A5F] rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-[#F0F4F8]">Import agenda from CSV</h2>
          <button onClick={onClose} className="text-[#64748B] hover:text-[#94A3B8] text-lg">✕</button>
        </div>

        {error && <p className="mb-3 text-sm text-[#EF4444] bg-[#EF4444]/10 rounded-lg px-3 py-2">{error}</p>}

        {step === 'upload' && (
          <div className="text-center py-8">
            <p className="text-sm text-[#94A3B8] mb-4">Upload a CSV file with session data. Required column: <strong className="text-[#F0F4F8]">title</strong>.</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              {loading ? 'Parsing…' : 'Choose CSV file'}
            </button>
          </div>
        )}

        {step === 'map' && (
          <div>
            <p className="text-sm text-[#94A3B8] mb-4">{rowCount} rows found. Map CSV columns to session fields:</p>
            <div className="space-y-2 mb-4">
              {headers.map(h => (
                <div key={h} className="flex items-center gap-3">
                  <div className="w-44 flex-shrink-0">
                    <span className="text-sm text-[#F0F4F8] font-mono">{h}</span>
                    {detected[h] && (
                      <span className="ml-2 text-xs" style={{ color: confidenceColor(detected[h].confidence) }}>
                        {confidenceLabel(detected[h].confidence)}
                      </span>
                    )}
                  </div>
                  <select
                    value={columnMap[h] ?? ''}
                    onChange={e => setColumnMap(prev => ({ ...prev, [h]: e.target.value }))}
                    className="flex-1 rounded border border-[#1E3A5F] bg-[#0D1B2A] px-2 py-1 text-sm text-[#F0F4F8] focus:border-[#00BFA6] focus:outline-none"
                  >
                    <option value="">— skip —</option>
                    {SESSION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-[#94A3B8] hover:text-[#F0F4F8]">Cancel</button>
              <button onClick={handlePreview} disabled={loading} className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>
                {loading ? 'Loading…' : 'Preview'}
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div>
            <p className="text-sm text-[#94A3B8] mb-3">Preview (first 5 rows):</p>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs text-[#F0F4F8]">
                <thead>
                  <tr className="border-b border-[#1E3A5F]">
                    {Object.keys(previewRows[0] ?? {}).map(k => <th key={k} className="text-left px-2 py-1 text-[#94A3B8]">{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b border-[#1E3A5F]/40">
                      {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1 truncate max-w-[160px]">{String(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setStep('map')} className="px-3 py-1.5 text-sm text-[#94A3B8] hover:text-[#F0F4F8]">Back</button>
              <button onClick={handleImport} disabled={loading} className="rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>
                {loading ? 'Importing…' : `Import ${rowCount} sessions`}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-6">
            <p className="text-[#00BFA6] font-semibold mb-2">Import complete</p>
            <p className="text-sm text-[#94A3B8]">{imported} session{imported !== 1 ? 's' : ''} added to the agenda.</p>
            <button onClick={onClose} className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function AgendaClient({ eventId, orgId, timezone, initialSessions, tracks, rooms: initialRooms, speakers, zoomConnected, teamsConnected }: AgendaClientProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions)
  const [editing, setEditing] = useState<Session | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [roomsState, setRoomsState] = useState<Room[]>(initialRooms)
  const [showRooms, setShowRooms] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [newRoomCap, setNewRoomCap] = useState('')
  const [newRoomHint, setNewRoomHint] = useState('')
  const [roomAdding, setRoomAdding] = useState(false)

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

  async function handleAddRoom() {
    if (!newRoomName.trim()) return
    setRoomAdding(true)
    const result = await createRoom(eventId, {
      name: newRoomName.trim(),
      capacity: newRoomCap ? parseInt(newRoomCap, 10) : null,
      location_hint: newRoomHint.trim() || null,
    })
    setRoomAdding(false)
    if (result && 'data' in result && result.data) {
      setRoomsState(prev => [...prev, result.data as Room])
      setNewRoomName('')
      setNewRoomCap('')
      setNewRoomHint('')
    }
  }

  async function handleDeleteRoom(roomId: string) {
    await deleteRoom(eventId, roomId)
    setRoomsState(prev => prev.filter(r => r.id !== roomId))
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {showImport && (
        <CsvImportModal
          eventId={eventId}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); reload() }}
        />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Agenda</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </p>
        </div>
        {!showForm && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-2 text-sm border border-[#1E3A5F] text-[#94A3B8] rounded-lg hover:text-[#F0F4F8] hover:border-[#00BFA6] transition-colors"
            >
              Import CSV
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-lg hover:opacity-90"
            >
              + Add Session
            </button>
          </div>
        )}
      </div>

      {/* Manage Rooms */}
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <button
          onClick={() => setShowRooms(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <span>Manage Rooms ({roomsState.length})</span>
          <span className="text-[var(--text-muted)]">{showRooms ? '▲' : '▼'}</span>
        </button>
        {showRooms && (
          <div className="border-t border-[var(--border)] p-4 space-y-3">
            {roomsState.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">No rooms yet — add one below.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Capacity</th>
                    <th className="pb-2 font-medium">Hint</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {roomsState.map(r => (
                    <tr key={r.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-4 text-[var(--text-muted)]">{r.capacity ?? '—'}</td>
                      <td className="py-2 pr-4 text-[var(--text-muted)]">{(r as any).location_hint ?? '—'}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => handleDeleteRoom(r.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="flex gap-2 items-end pt-1">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Name *</label>
                <input
                  className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-[var(--text-primary)] w-36"
                  placeholder="e.g. Room A"
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Capacity</label>
                <input
                  type="number"
                  min="1"
                  className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-[var(--text-primary)] w-20"
                  placeholder="—"
                  value={newRoomCap}
                  onChange={e => setNewRoomCap(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">Location hint</label>
                <input
                  className="px-2 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-[var(--text-primary)] w-36"
                  placeholder="e.g. 2nd floor"
                  value={newRoomHint}
                  onChange={e => setNewRoomHint(e.target.value)}
                />
              </div>
              <button
                onClick={handleAddRoom}
                disabled={roomAdding || !newRoomName.trim()}
                className="px-3 py-1.5 text-sm font-semibold rounded-lg disabled:opacity-50"
                style={{ background: 'var(--brand-teal)', color: '#0D1B2A' }}
              >
                {roomAdding ? 'Adding…' : '+ Add'}
              </button>
            </div>
          </div>
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
            rooms={roomsState}
            speakers={speakers}
            sessions={sessions}
            session={editing}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      )}

      <AgendaGrid
        sessions={sessions}
        tracks={tracks}
        rooms={roomsState}
        timezone={timezone}
        onEdit={handleEdit}
        onDelete={handleDelete}
        orgId={orgId}
        zoomConnected={zoomConnected}
        teamsConnected={teamsConnected}
        onSessionUpdated={reload}
      />
    </div>
  )
}
