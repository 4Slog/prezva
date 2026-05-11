'use client'

import { useState } from 'react'
import type { Track, Room, Speaker, Session } from '@/lib/agenda/actions'

interface SessionFormProps {
  eventId: string
  tracks: Track[]
  rooms: Room[]
  speakers: Speaker[]
  session?: Session | null
  onSave: (data: Record<string, any>) => Promise<void>
  onCancel: () => void
}

const SESSION_TYPES = ['talk', 'workshop', 'panel', 'keynote', 'break', 'networking', 'other']

function fmt(iso: string) { return iso ? iso.slice(0, 16) : '' }
function toIso(local: string) { return local ? new Date(local).toISOString() : '' }

const inputStyle = {
  background: 'var(--pz-surface-2)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
}

export function SessionForm({ tracks, rooms, speakers, session, onSave, onCancel }: SessionFormProps) {
  const [title, setTitle] = useState(session?.title ?? '')
  const [description, setDescription] = useState(session?.description ?? '')
  const [type, setType] = useState(session?.session_type ?? 'talk')
  const [startsAt, setStartsAt] = useState(fmt(session?.starts_at ?? ''))
  const [endsAt, setEndsAt] = useState(fmt(session?.ends_at ?? ''))
  const [trackId, setTrackId] = useState(session?.track_id ?? '')
  const [roomId, setRoomId] = useState(session?.room_id ?? '')
  const [speakerIds, setSpeakerIds] = useState<string[]>(session?.speakers?.map(s => s.id) ?? [])
  const [tagsInput, setTagsInput] = useState((session?.tags ?? []).join(', '))
  const [visibleFrom, setVisibleFrom] = useState(fmt(session?.visible_from ?? ''))
  const [visibleUntil, setVisibleUntil] = useState(fmt(session?.visible_until ?? ''))
  const [videoUrl, setVideoUrl] = useState(session?.video_url ?? '')
  const [capacity, setCapacity] = useState(session?.capacity?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleSpeaker(id: string) {
    setSpeakerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit() {
    if (!title || !startsAt || !endsAt) { setError('Title, start time, and end time are required'); return }
    setSaving(true)
    setError('')
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)
    try {
      await onSave({
        title,
        description: description || null,
        session_type: type,
        starts_at: toIso(startsAt),
        ends_at: toIso(endsAt),
        track_id: trackId || null,
        room_id: roomId || null,
        speaker_ids: speakerIds,
        tags,
        visible_from: visibleFrom ? toIso(visibleFrom) : null,
        visible_until: visibleUntil ? toIso(visibleUntil) : null,
        video_url: videoUrl || null,
        capacity: capacity ? parseInt(capacity) : null,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm focus:outline-none'

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Title *</label>
        <input className={inputCls} style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Session title" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Description</label>
        <textarea className={inputCls + ' resize-none'} style={inputStyle} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Type</label>
          <select className={inputCls} style={inputStyle} value={type} onChange={e => setType(e.target.value as any)}>
            {SESSION_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Track</label>
          <select className={inputCls} style={inputStyle} value={trackId} onChange={e => setTrackId(e.target.value)}>
            <option value="">No track</option>
            {tracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Starts At *</label>
          <input type="datetime-local" className={inputCls} style={inputStyle} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Ends At *</label>
          <input type="datetime-local" className={inputCls} style={inputStyle} value={endsAt} onChange={e => setEndsAt(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Room</label>
          <select className={inputCls} style={inputStyle} value={roomId} onChange={e => setRoomId(e.target.value)}>
            <option value="">No room</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Capacity (blank = unlimited)</label>
          <input type="number" min="1" className={inputCls} style={inputStyle} value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 50" />
        </div>
      </div>

      {speakers.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Speakers</label>
          <div className="flex flex-wrap gap-2">
            {speakers.map(s => {
              const active = speakerIds.includes(s.id)
              return (
                <button
                  key={s.id} type="button"
                  onClick={() => toggleSpeaker(s.id)}
                  className="rounded-full px-3 py-1 text-xs font-medium transition-opacity"
                  style={{
                    background: active ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                    color: active ? '#0D1B2A' : 'var(--pz-muted)',
                    border: '1px solid ' + (active ? 'var(--pz-teal)' : 'var(--pz-border)'),
                  }}
                >
                  {s.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Tags (comma-separated)</label>
        <input
          className={inputCls}
          style={inputStyle}
          value={tagsInput}
          onChange={e => setTagsInput(e.target.value)}
          placeholder="e.g. AI, Leadership, Workshop"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Video URL (embed for attendees)</label>
        <input
          className={inputCls}
          style={inputStyle}
          value={videoUrl}
          onChange={e => setVideoUrl(e.target.value)}
          placeholder="https://youtube.com/... or Zoom link"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Visible From (leave blank = always)</label>
          <input type="datetime-local" className={inputCls} style={inputStyle} value={visibleFrom} onChange={e => setVisibleFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium" style={{ color: 'var(--pz-muted)' }}>Visible Until (leave blank = always)</label>
          <input type="datetime-local" className={inputCls} style={inputStyle} value={visibleUntil} onChange={e => setVisibleUntil(e.target.value)} />
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--pz-error)' }}>{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm"
          style={{ color: 'var(--pz-muted)' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {saving ? 'Saving…' : session ? 'Update' : 'Create'}
        </button>
      </div>
    </div>
  )
}
