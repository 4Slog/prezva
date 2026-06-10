'use client'

import { useState } from 'react'
import { createEventFromEmbed } from '@/lib/embedded/event-actions'
import { GhlProductPicker } from '@/app/embedded/_components/ghl-product-picker'

interface Props {
  orgId: string
}

type Step = 'form' | 'picker'

const TIMEZONES = [
  { value: 'America/New_York',     label: 'Eastern (ET)' },
  { value: 'America/Chicago',      label: 'Central (CT)' },
  { value: 'America/Denver',       label: 'Mountain (MT)' },
  { value: 'America/Los_Angeles',  label: 'Pacific (PT)' },
  { value: 'UTC',                  label: 'UTC' },
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

export function CreateEventForm({ orgId: _orgId }: Props) {
  const [step, setStep] = useState<Step>('form')
  const [newEventId, setNewEventId] = useState<string | null>(null)
  const [newEventSlug, setNewEventSlug] = useState<string | null>(null)
  const [eventType, setEventType] = useState('in_person')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createEventFromEmbed(fd)
    setPending(false)
    if ('error' in result) {
      setError(result.error)
    } else {
      setNewEventId(result.id)
      setNewEventSlug(result.slug)
      setStep('picker')
    }
  }

  if (step === 'picker' && newEventId) {
    return (
      <div className="flex flex-col gap-5">
        {/* Success banner */}
        <div
          className="flex items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--pz-teal)', background: 'color-mix(in srgb, var(--pz-teal) 6%, var(--pz-surface))' }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>Event created</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
              Slug: <code className="font-mono">{newEventSlug}</code>
            </p>
          </div>
        </div>

        {/* Product picker */}
        <div
          className="flex flex-col gap-4 rounded-xl border p-5"
          style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}
        >
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>Link a GHL product</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>
              Select a GHL product to mirror as a Prezva ticket type. GHL handles inventory + checkout; Prezva handles check-in, badges, and certificates.
            </p>
          </div>
          <GhlProductPicker eventId={newEventId} />
        </div>

        <div className="flex gap-3">
          <a
            href="/embedded/events"
            className="flex-1 rounded-lg py-2.5 text-center text-sm font-semibold transition-opacity hover:opacity-75"
            style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)', background: 'var(--pz-surface)' }}
          >
            Back to events
          </a>
          <button
            onClick={() => { setStep('form'); setNewEventId(null); setNewEventSlug(null) }}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-75"
            style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
          >
            Create another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Basic info */}
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
            <select name="timezone" defaultValue="America/Chicago" className={inputCls} style={inputStyle}>
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
            <input type="datetime-local" name="start_at" required className={inputCls} style={inputStyle} />
          </Field>
          <Field label="End" required>
            <input type="datetime-local" name="end_at" required className={inputCls} style={inputStyle} />
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
            <input name="venue_name" placeholder="Convention Center" className={inputCls} style={inputStyle} />
          </Field>
          <Field label="Address">
            <input name="venue_address" placeholder="123 Main St" className={inputCls} style={inputStyle} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="City">
              <input name="venue_city" className={inputCls} style={inputStyle} />
            </Field>
            <Field label="State">
              <input name="venue_state" className={inputCls} style={inputStyle} />
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
            <input name="virtual_url" type="url" placeholder="https://zoom.us/j/…" className={inputCls} style={inputStyle} />
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
            <input name="capacity" type="number" min="1" placeholder="Unlimited" className={inputCls} style={inputStyle} />
          </Field>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input name="waitlist_enabled" type="checkbox" value="true" className="rounded" />
              <span className="text-sm" style={{ color: 'var(--pz-muted)' }}>Enable waitlist</span>
            </label>
          </div>
        </div>
      </div>

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
        {pending ? 'Creating…' : 'Create event'}
      </button>
    </form>
  )
}
