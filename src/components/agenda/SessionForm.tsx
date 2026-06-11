'use client'

import { useState } from 'react'
import type { Track, Room, Speaker, Session, OrgSessionType } from '@/lib/agenda/actions'
import { BUILTIN_SESSION_TYPES } from '@/lib/agenda/actions'
import { Field } from '@/components/ui/Field'

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
  customTypes?: OrgSessionType[]
  onSave: (data: Record<string, any>) => Promise<void>
  onCancel: () => void
}

const SPEAKER_ROLES = [
  { value: 'presenter', label: 'Presenter' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'panelist', label: 'Panelist' },
  { value: 'co-presenter', label: 'Co-presenter' },
  { value: 'discussant', label: 'Discussant' },
  { value: 'introducer', label: 'Introducer' },
]

function fmt(iso: string) { return iso ? iso.slice(0, 16) : '' }
function toIso(local: string) { return local ? new Date(local).toISOString() : '' }

export function SessionForm({ tracks, rooms, speakers, sponsors = [], sessions = [], session, customTypes = [], onSave, onCancel }: SessionFormProps) {
  const [title, setTitle] = useState(session?.title ?? '')
  const [description, setDescription] = useState(session?.description ?? '')
  const [type, setType] = useState(session?.session_type ?? 'talk')
  const [startsAt, setStartsAt] = useState(fmt(session?.starts_at ?? ''))
  const [endsAt, setEndsAt] = useState(fmt(session?.ends_at ?? ''))
  const [trackId, setTrackId] = useState(session?.track_id ?? '')
  const [roomId, setRoomId] = useState(session?.room_id ?? '')
  const [sponsoredById, setSponsoredById] = useState(session?.sponsored_by_id ?? '')
  const [capacity, setCapacity] = useState<string>(session?.capacity != null ? String(session.capacity) : '')
  const [speakerRoles, setSpeakerRoles] = useState<Record<string, string>>(
    () => (session?.speakers ?? []).reduce((acc, s) => ({
      ...acc,
      [s.id]: (s as any).session_role ?? 'presenter',
    }), {} as Record<string, string>)
  )
  const [ceHours, setCeHours] = useState<string>(session?.ce_credit_hours != null ? String(session.ce_credit_hours) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Detect room conflicts when room + times are set
  const conflict = roomId && startsAt && endsAt
    ? sessions.find(s => s.id !== session?.id && s.room_id === roomId && new Date(s.starts_at) < new Date(toIso(endsAt)) && new Date(s.ends_at) > new Date(toIso(startsAt)))
    : null
  const conflictRoom = conflict ? rooms.find(r => r.id === conflict.room_id) : null

  function toggleSpeaker(id: string) {
    setSpeakerRoles(prev => {
      if (id in prev) {
        const next = { ...prev }
        delete next[id]
        return next
      }
      // Default role based on session type
      const role = type === 'panel'
        ? (Object.keys(prev).length === 0 ? 'moderator' : 'panelist')
        : 'presenter'
      return { ...prev, [id]: role }
    })
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
        speaker_ids: Object.keys(speakerRoles),
        speaker_roles: speakerRoles,
        ce_credit_hours: ceHours !== '' ? parseFloat(ceHours) : null,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-[var(--pz-border)] rounded-lg bg-[var(--pz-bg)] text-sm text-[var(--pz-text)]'
  const labelCls = 'block text-xs font-medium text-[var(--pz-muted)] mb-1'

  const selectedSpeakers = speakers.filter(s => s.id in speakerRoles)

  return (
    <div className="space-y-4">
      <Field label="Title" htmlFor="sess-title" required>
        <input id="sess-title" className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" />
      </Field>

      <Field label="Description" htmlFor="sess-desc">
        <textarea id="sess-desc" className={inputCls + ' resize-none'} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" htmlFor="sess-type">
          <select id="sess-type" className={inputCls} value={type} onChange={e => setType(e.target.value)}>
            <optgroup label="Built-in">
              {BUILTIN_SESSION_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </optgroup>
            {customTypes.length > 0 && (
              <optgroup label="Custom">
                {customTypes.map(t => (
                  <option key={t.slug} value={t.slug}>{t.label}</option>
                ))}
              </optgroup>
            )}
            {/* Preserve unknown type if existing session has a deleted custom type */}
            {type && !BUILTIN_SESSION_TYPES.includes(type as any) && !customTypes.some(t => t.slug === type) && (
              <optgroup label="Unknown">
                <option value={type}>{type}</option>
              </optgroup>
            )}
          </select>
        </Field>
        <Field label="Track" htmlFor="sess-track">
          <select id="sess-track" className={inputCls} value={trackId} onChange={e => setTrackId(e.target.value)}>
            <option value="">No track</option>
            {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts At" htmlFor="sess-start" required>
          <input id="sess-start" type="datetime-local" className={inputCls} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Ends At" htmlFor="sess-end" required>
          <input id="sess-end" type="datetime-local" className={inputCls} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Room" htmlFor="sess-room">
          <select id="sess-room" className={inputCls} value={roomId} onChange={e => setRoomId(e.target.value)}>
            <option value="">No room</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Max attendees" htmlFor="sess-cap">
          <input
            id="sess-cap"
            type="number"
            min="1"
            className={inputCls}
            value={capacity}
            onChange={e => setCapacity(e.target.value)}
            placeholder="Unlimited"
          />
        </Field>
      </div>

      {sponsors.length > 0 && (
        <Field label="Sponsor" htmlFor="sess-sponsor">
          <select id="sess-sponsor" className={inputCls} value={sponsoredById} onChange={e => setSponsoredById(e.target.value)}>
            <option value="">No sponsor</option>
            {sponsors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}

      {conflict && (
        <p className="text-xs text-amber-400">
          ⚠ {conflictRoom?.name ?? 'Room'} is already booked at this time by &ldquo;{conflict.title}&rdquo;
        </p>
      )}

      <Field label="CE Credit Hours" htmlFor="sess-ce">
        <input
          id="sess-ce"
          type="number"
          step="0.25"
          min="0"
          max="24"
          className={inputCls}
          value={ceHours}
          onChange={e => setCeHours(e.target.value)}
          placeholder="0.00"
        />
      </Field>

      {speakers.length > 0 && (
        <div>
          <label className={labelCls}>Speakers</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {speakers.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSpeaker(s.id)}
                className={
                  'px-3 py-1 rounded-full text-xs font-medium border transition-colors ' +
                  (s.id in speakerRoles
                    ? 'bg-[var(--pz-teal)] text-[var(--pz-on-accent)] border-[var(--pz-teal)]'
                    : 'bg-[var(--pz-bg)] text-[var(--pz-muted)] border-[var(--pz-border)]')
                }
              >
                {s.name}
              </button>
            ))}
          </div>
          {selectedSpeakers.length > 0 && (
            <div className="space-y-2">
              {selectedSpeakers.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className="text-xs text-[var(--pz-text)] min-w-[120px]">{s.name}</span>
                  <select
                    value={speakerRoles[s.id]}
                    onChange={e => setSpeakerRoles(prev => ({ ...prev, [s.id]: e.target.value }))}
                    className="px-2 py-1 border border-[var(--pz-border)] rounded-lg bg-[var(--pz-bg)] text-xs text-[var(--pz-text)]"
                  >
                    {SPEAKER_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-[var(--pz-muted)] hover:text-[var(--pz-text)]">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-4 py-2 text-sm bg-[var(--pz-teal)] text-[var(--pz-on-accent)] rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : session ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}
