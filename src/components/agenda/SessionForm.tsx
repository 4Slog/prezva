'use client'

import { useState } from 'react'
import type { Track, Room, Speaker, Session } from '@/lib/agenda/actions'

interface SessionSponsor {
  id: string
  name: string
}

interface SessionFormProps {
  eventId: string
  tracks: Track[]
  rooms: Room[]
  speakers: Speaker[]
  sponsors?: SessionSponsor[]
  sessions?: Session[]
  session?: Session | null
  onSave: (data: Record<string, any>) => Promise<void>
  onCancel: () => void
}

const SESSION_TYPES = ['talk', 'workshop', 'panel', 'keynote', 'break', 'networking', 'other']

function fmt(iso: string) { return iso ? iso.slice(0, 16) : '' }
function toIso(local: string) { return local ? new Date(local).toISOString() : '' }

export function SessionForm({ tracks, rooms, speakers, sponsors = [], sessions = [], session, onSave, onCancel }: SessionFormProps) {
  const [title, setTitle] = useState(session?.title ?? '')
  const [description, setDescription] = useState(session?.description ?? '')
  const [type, setType] = useState(session?.session_type ?? 'talk')
  const [startsAt, setStartsAt] = useState(fmt(session?.starts_at ?? ''))
  const [endsAt, setEndsAt] = useState(fmt(session?.ends_at ?? ''))
  const [trackId, setTrackId] = useState(session?.track_id ?? '')
  const [roomId, setRoomId] = useState(session?.room_id ?? '')
  const [sponsoredById, setSponsoredById] = useState(session?.sponsored_by_id ?? '')
  const [capacity, setCapacity] = useState<string>(session?.capacity != null ? String(session.capacity) : '')
  const [speakerIds, setSpeakerIds] = useState<string[]>(session?.speakers?.map(s => s.id) ?? [])
  const [ceHours, setCeHours] = useState<string>(session?.ce_credit_hours != null ? String(session.ce_credit_hours) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Detect room conflicts when room + times are set
  const conflict = roomId && startsAt && endsAt
    ? sessions.find(s => s.id !== session?.id && s.room_id === roomId && new Date(s.starts_at) < new Date(toIso(endsAt)) && new Date(s.ends_at) > new Date(toIso(startsAt)))
    : null
  const conflictRoom = conflict ? rooms.find(r => r.id === conflict.room_id) : null

  function toggleSpeaker(id: string) {
    setSpeakerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit() {
    if (!title || !startsAt || !endsAt) { setError('Title, start time, and end time are required'); return }
    setSaving(true)
    setError('')
    try {
      await onSave({
        title, description: description || null, session_type: type,
        starts_at: toIso(startsAt), ends_at: toIso(endsAt),
        track_id: trackId || null, room_id: roomId || null,
        sponsored_by_id: sponsoredById || null,
        capacity: capacity !== '' ? parseInt(capacity, 10) : null,
        speaker_ids: speakerIds,
        ce_credit_hours: ceHours !== '' ? parseFloat(ceHours) : null,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-[var(--border)] rounded-lg bg-[var(--bg-page)] text-sm text-[var(--text-primary)]'
  const labelCls = 'block text-xs font-medium text-[var(--text-muted)] mb-1'

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Title *</label>
        <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea className={inputCls + ' resize-none'} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Type</label>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value as any)}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Track</label>
          <select className={inputCls} value={trackId} onChange={e => setTrackId(e.target.value)}>
            <option value="">No track</option>
            {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Starts At *</label>
          <input type="datetime-local" className={inputCls} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Ends At *</label>
          <input type="datetime-local" className={inputCls} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Room</label>
          <select className={inputCls} value={roomId} onChange={e => setRoomId(e.target.value)}>
            <option value="">No room</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Max attendees</label>
          <input
            type="number"
            min="1"
            className={inputCls}
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
            placeholder="Unlimited"
          />
        </div>
      </div>

      {sponsors.length > 0 && (
        <div>
          <label className={labelCls}>Sponsor</label>
          <select className={inputCls} value={sponsoredById} onChange={e => setSponsoredById(e.target.value)}>
            <option value="">No sponsor</option>
            {sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}

      {conflict && (
        <p className="text-xs text-amber-400">
          ⚠ {conflictRoom?.name ?? 'Room'} is already booked at this time by &ldquo;{conflict.title}&rdquo;
        </p>
      )}

      <div>
        <label className={labelCls}>CE Credit Hours</label>
        <input
          type="number"
          step="0.25"
          min="0"
          max="24"
          className={inputCls}
          value={ceHours}
          onChange={e => setCeHours(e.target.value)}
          placeholder="0.00"
        />
      </div>

      {speakers.length > 0 && (
        <div>
          <label className={labelCls}>Speakers</label>
          <div className="flex flex-wrap gap-2">
            {speakers.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSpeaker(s.id)}
                className={
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors ' +
                  (speakerIds.includes(s.id)
                    ? 'bg-[var(--brand-teal)] text-white border-[var(--brand-teal)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-muted)] border-[var(--border)]')
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-2 text-sm bg-[var(--brand-teal)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : session ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}
