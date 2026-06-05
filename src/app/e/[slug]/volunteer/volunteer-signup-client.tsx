'use client'

import { useState } from 'react'
import { signupAsVolunteer } from '@/lib/volunteers/actions'
import { Field } from '@/components/ui/Field'

const ROLE_OPTIONS = [
  { value: 'registration-desk', label: 'Registration Desk' },
  { value: 'check-in',          label: 'Check-in Scanner' },
  { value: 'session-monitor',   label: 'Session Monitor' },
  { value: 'general',           label: 'General Help' },
  { value: 'team-lead',         label: 'Team Lead' },
] as const

type Props = {
  eventId: string
  eventTitle: string
}

export function VolunteerSignupClient({ eventId, eventTitle }: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'general',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const inputStyle = {
    width: '100%',
    background: 'var(--pz-surface)',
    border: '1px solid var(--pz-border)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 14,
    color: 'var(--pz-text)',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const result = await signupAsVolunteer(
        eventId,
        form.name,
        form.email,
        form.phone || null,
        form.role,
        form.notes || null,
      )
      if ((result as any).error) {
        setError((result as any).error)
      } else {
        setDone(true)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={{ background: 'var(--pz-teal-bg)', border: '1px solid var(--pz-teal)', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
        <p style={{ fontSize: 24, marginBottom: 8 }}>✓</p>
        <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--pz-teal-ink)', marginBottom: 8 }}>Application submitted!</p>
        <p style={{ fontSize: 14, color: 'var(--pz-muted)' }}>
          You&apos;ll receive an email when your assignment is confirmed.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 'clamp(1.5rem,3.5vw,2rem)', fontWeight: 800, marginBottom: 8 }}>
          Volunteer for {eventTitle}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', lineHeight: 1.6 }}>
          Fill out the form below to apply as a volunteer. The organizer will review your application and send your assignment details.
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--pz-error-bg)', border: '1px solid var(--pz-error)', borderRadius: 8, padding: '10px 14px', color: 'var(--pz-error)', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Field label="Full name" htmlFor="vol-name" required>
          <input
            id="vol-name"
            required
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={inputStyle}
            placeholder="Your full name"
          />
        </Field>
        <Field label="Email" htmlFor="vol-email" required>
          <input
            id="vol-email"
            required
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            style={inputStyle}
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Phone" htmlFor="vol-phone">
          <input
            id="vol-phone"
            type="tel"
            value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            style={inputStyle}
            placeholder="Optional"
          />
        </Field>
        <Field label="Role preference" htmlFor="vol-role">
          <select
            id="vol-role"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {ROLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Availability notes" htmlFor="vol-notes">
        <textarea
          id="vol-notes"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="e.g. Available all day Saturday only"
        />
      </Field>

      <div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            background: 'var(--pz-teal)',
            color: 'var(--pz-on-accent)',
            padding: '12px 28px',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 15,
            border: 'none',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Submitting…' : 'Apply to volunteer'}
        </button>
      </div>
    </form>
  )
}
