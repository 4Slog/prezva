'use client'

import { useState } from 'react'
import { kioskCheckInByEmail } from '@/lib/checkin/sprint7-actions'

type Step = 'email' | 'success' | 'not_found'

interface Result {
  attendee_name: string
  ticket_name: string
  already_checked_in: boolean
}

export function KioskClient({ eventId }: { eventId: string }) {
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<Step>('email')
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    const data = await kioskCheckInByEmail(eventId, email.trim())
    setSubmitting(false)

    if (!data.found) {
      setStep('not_found')
    } else {
      setResult({
        attendee_name: data.attendee_name ?? '',
        ticket_name: data.ticket_name ?? '',
        already_checked_in: data.already_checked_in ?? false,
      })
      setStep('success')
    }
  }

  function reset() {
    setEmail('')
    setStep('email')
    setResult(null)
  }

  const inputStyle = {
    background: 'var(--pz-surface-2)',
    border: '1px solid var(--pz-border)',
    color: 'var(--pz-text)',
    fontSize: 18,
  }

  if (step === 'success' && result) {
    return (
      <div className="pz-card p-8 text-center">
        <div className="text-5xl mb-4">{result.already_checked_in ? '⚠' : '✓'}</div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: result.already_checked_in ? 'var(--pz-warning)' : 'var(--pz-success)' }}>
          {result.already_checked_in ? 'Already Checked In' : 'Welcome!'}
        </h2>
        <p className="text-lg font-semibold mb-1" style={{ color: 'var(--pz-text)' }}>{result.attendee_name}</p>
        <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>{result.ticket_name}</p>
        <button
          onClick={reset}
          className="rounded-lg px-6 py-3 text-sm font-semibold"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Next attendee
        </button>
      </div>
    )
  }

  if (step === 'not_found') {
    return (
      <div className="pz-card p-8 text-center">
        <div className="text-5xl mb-4">✗</div>
        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--pz-error)' }}>Not Found</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--pz-muted)' }}>
          No registration found for <strong>{email}</strong>. Please check the email address or see a staff member.
        </p>
        <button
          onClick={reset}
          className="rounded-lg px-6 py-3 text-sm font-semibold"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="pz-card p-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Enter your registration email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoFocus
            className="w-full rounded-xl px-4 py-3 focus:outline-none"
            style={inputStyle}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-xl px-4 py-4 text-lg font-bold disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {submitting ? 'Checking in…' : 'Check In'}
        </button>
      </form>
    </div>
  )
}
