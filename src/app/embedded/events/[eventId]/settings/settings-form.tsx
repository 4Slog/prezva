'use client'

import { useState } from 'react'
import { embedUpdateEvent } from '@/lib/embedded/event-actions'

interface EventData {
  id: string
  title: string | null
  description: string | null
  event_type: string | null
  timezone: string | null
  start_at: string | null
  end_at: string | null
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  virtual_url: string | null
  capacity: number | null
  waitlist_enabled: boolean | null
}

interface Props {
  eventId: string
  event: EventData
}

const TIMEZONES = [
  { value: 'America/New_York',    label: 'Eastern (ET)' },
  { value: 'America/Chicago',     label: 'Central (CT)' },
  { value: 'America/Denver',      label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific (PT)' },
  { value: 'UTC',                 label: 'UTC' },
]

const inputCls = [
  'w-full rounded-lg border px-3 py-2 text-sm transition-colors',
  'focus:outline-none focus:ring-1',
].join(' ')

const inputStyle = {
  borderColor: 'var(--pz-border)',
  background:  'var(--pz-surface)',
  color:       'var(--pz-text)',
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold" style={{ color: 'var(--pz-text)' }}>
        {label}{required && <span style={{ color: 'var(--pz-teal)' }}> *</span>}
      </label>
      {children}
    </div>
  )
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

export function EventSettingsForm({ eventId, event }: Props) {
  const [eventType, setEventType] = useState(event.event_type ?? 'in_person')
  const [error, setError]   = useState<string | null>(null)
  const [saved, setSaved]   = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    setPending(true)
    try {
      const fd = new FormData(e.currentTarget)
      const result = await embedUpdateEvent(eventId, fd)
      if ('error' in result) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Details */}
      <div
        className="flex flex-col gap-4 rounded-xl border p-5"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pz-muted)' }}>
          Details
        </h2>
        <Field label="Event name" required>
          <input
            name="title"
            required
            minLength={2}
            maxLength={120}
            defaultValue={event.title ?? ''}
            placeholder="2026 Annual Leadership Summit"
            className={inputCls}
            style={inputStyle}
          />
        </Field>
        <Field label="Description">
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            defaultValue={event.description ?? ''}
            placeholder="What is this event about?"
            className={`${inputCls} resize-none`}
            style={inputStyle}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Event type" required>
            <select
              name="event_type"
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              className={inputCls}
              style={inputStyle}
            >
              <option value="in_person">In Person</option>
              <option value="virtual">Virtual</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </Field>
          <Field label="Timezone" required>
            <select
              name="timezone"
              defaultValue={event.timezone ?? 'America/Chicago'}
              className={inputCls}
              style={inputStyle}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {/* Date & time */}
      <div
        className="flex flex-col gap-4 rounded-xl border p-5"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pz-muted)' }}>
          Date & time
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start" required>
            <input
              type="datetime-local"
              name="start_at"
              required
              defaultValue={toDatetimeLocal(event.start_at)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="End" required>
            <input
              type="datetime-local"
              name="end_at"
              required
              defaultValue={toDatetimeLocal(event.end_at)}
              className={inputCls}
              style={inputStyle}
            />
          </Field>
        </div>
      </div>

      {/* Venue (in_person / hybrid) */}
      {(eventType === 'in_person' || eventType === 'hybrid') && (
        <div
          className="flex flex-col gap-4 rounded-xl border p-5"
          style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pz-muted)' }}>
            Venue
          </h2>
          <Field label="Venue name">
            <input
              name="venue_name"
              defaultValue={event.venue_name ?? ''}
              placeholder="Convention Center"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field label="Address">
            <input
              name="venue_address"
              defaultValue={event.venue_address ?? ''}
              placeholder="123 Main St"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <input
                name="venue_city"
                defaultValue={event.venue_city ?? ''}
                className={inputCls}
                style={inputStyle}
              />
            </Field>
            <Field label="State">
              <input
                name="venue_state"
                defaultValue={event.venue_state ?? ''}
                className={inputCls}
                style={inputStyle}
              />
            </Field>
          </div>
        </div>
      )}

      {/* Virtual URL (virtual / hybrid) */}
      {(eventType === 'virtual' || eventType === 'hybrid') && (
        <div
          className="flex flex-col gap-4 rounded-xl border p-5"
          style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pz-muted)' }}>
            Virtual
          </h2>
          <Field label="Stream / meeting URL">
            <input
              name="virtual_url"
              type="url"
              defaultValue={event.virtual_url ?? ''}
              placeholder="https://zoom.us/j/…"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
        </div>
      )}

      {/* Capacity */}
      <div
        className="flex flex-col gap-4 rounded-xl border p-5"
        style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--pz-muted)' }}>
          Capacity
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Max attendees">
            <input
              name="capacity"
              type="number"
              min="1"
              defaultValue={event.capacity ?? ''}
              placeholder="Unlimited"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                name="waitlist_enabled"
                type="checkbox"
                value="true"
                defaultChecked={event.waitlist_enabled ?? false}
                className="rounded"
              />
              <span className="text-sm" style={{ color: 'var(--pz-muted)' }}>Enable waitlist</span>
            </label>
          </div>
        </div>
      </div>

      {saved && (
        <div
          className="flex items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--pz-teal)', background: 'color-mix(in srgb, var(--pz-teal) 6%, var(--pz-surface))' }}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>Changes saved</p>
        </div>
      )}

      {error && (
        <p
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'color-mix(in srgb, var(--pz-error, #dc2626) 10%, transparent)', color: 'var(--pz-error, #dc2626)' }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl py-3 text-sm font-semibold transition-opacity disabled:opacity-50"
        style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  )
}
