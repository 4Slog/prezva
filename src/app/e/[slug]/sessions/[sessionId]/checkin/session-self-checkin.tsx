'use client'

import { useState } from 'react'
import { kioskCheckInByEmail } from '@/lib/checkin/sprint7-actions'

export function SessionSelfCheckIn({
  eventId,
  sessionId,
  userId,
  registrationId,
  userEmail,
  eventSlug,
}: {
  eventId: string
  sessionId: string
  userId: string | null
  registrationId: string | null
  userEmail: string | null
  eventSlug: string
}) {
  const [email, setEmail] = useState(userEmail ?? '')
  const [status, setStatus] = useState<'idle' | 'success' | 'already' | 'not_found'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [attendeeName, setAttendeeName] = useState('')

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const result = await kioskCheckInByEmail(eventId, email.trim())
    setSubmitting(false)

    if (!result.found) {
      setStatus('not_found')
    } else {
      setAttendeeName(result.attendee_name ?? '')
      setStatus(result.already_checked_in ? 'already' : 'success')
    }
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  if (status === 'success') {
    return (
      <div className="pz-card p-8 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-success)' }}>Checked in!</h2>
        <p className="text-base mb-4" style={{ color: 'var(--pz-text)' }}>{attendeeName}</p>
        <a href={`/e/${eventSlug}/sessions/${sessionId}`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>
          ← Back to session
        </a>
      </div>
    )
  }

  if (status === 'already') {
    return (
      <div className="pz-card p-8 text-center">
        <div className="text-5xl mb-4">✓</div>
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--pz-warning)' }}>Already checked in</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>{attendeeName} was already marked present.</p>
        <a href={`/e/${eventSlug}/sessions/${sessionId}`} className="text-sm" style={{ color: 'var(--pz-teal)' }}>
          ← Back to session
        </a>
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="pz-card p-8 text-center">
        <div className="text-4xl mb-4">✗</div>
        <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--pz-error)' }}>Registration not found</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--pz-muted)' }}>
          No registration found for <strong>{email}</strong>. Please try your registration email or see staff.
        </p>
        <button onClick={() => setStatus('idle')} className="text-sm" style={{ color: 'var(--pz-teal)' }}>
          Try again
        </button>
      </div>
    )
  }

  if (!userId) {
    return (
      <div className="pz-card p-6 text-center">
        <p className="text-sm mb-3" style={{ color: 'var(--pz-muted)' }}>
          Sign in or enter your registration email to check in.
        </p>
        <a
          href={`/login?next=/e/${eventSlug}/sessions/${sessionId}/checkin`}
          className="inline-block rounded-lg px-5 py-2 text-sm font-semibold"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Sign in
        </a>
        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--pz-border)' }}>
          <p className="text-xs mb-2" style={{ color: 'var(--pz-muted)' }}>Or check in with your email</p>
          <form onSubmit={handleCheckIn} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={inputStyle}
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
            >
              Check In
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="pz-card p-6">
      <form onSubmit={handleCheckIn} className="space-y-4">
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          Confirm your email to check in to this session.
        </p>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {submitting ? 'Checking in…' : 'Check In to Session'}
        </button>
      </form>
    </div>
  )
}
