'use client'

import Image from 'next/image'
import { useState } from 'react'
import { selfCheckInRegistration, selfCheckInByEmailPin } from '@/lib/checkin/self-checkin-actions'
import type { SelfCheckInResult } from '@/lib/checkin/self-checkin-actions'

interface Props {
  scope: 'event' | 'session'
  eventId: string
  eventTitle: string
  sessionId?: string
  sessionTitle?: string
  registrationId?: string
}

type State = 'idle' | 'pin-form' | 'loading' | 'done' | 'error'

export default function SelfCheckInWithPin({
  scope,
  eventId,
  eventTitle,
  sessionId,
  sessionTitle,
  registrationId,
}: Props) {
  const [state, setState] = useState<State>(registrationId ? 'idle' : 'pin-form')
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [result, setResult] = useState<SelfCheckInResult>({} as SelfCheckInResult)

  const displayTitle = sessionTitle ?? eventTitle
  const displaySubtitle = sessionTitle ? `${eventTitle} · Session check-in` : 'Event check-in'

  async function handleSignedIn() {
    if (!registrationId) return
    setState('loading')
    const res = await selfCheckInRegistration(registrationId, sessionId ?? null)
    setResult(res)
    setState(res.success ? 'done' : 'error')
  }

  async function handleEmailPin(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    const res = await selfCheckInByEmailPin(
      eventId,
      sessionId ?? null,
      email.trim().toLowerCase(),
      pin.trim(),
    )
    setResult(res)
    setState(res.success ? 'done' : 'error')
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--pz-bg)', padding: '2rem',
    }}>
      <div style={{
        maxWidth: 400, width: '100%', background: 'var(--pz-surface)',
        borderRadius: 16, padding: '2.5rem', textAlign: 'center',
        border: '1px solid var(--pz-border)',
      }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Image
            src="/logo-mark.svg" width={48} height={48} alt="Prezva"
            style={{ margin: '0 auto', display: 'block' }}
          />
        </div>

        {state === 'idle' && (
          <>
            <h1 style={{ color: 'var(--pz-text)', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              {displayTitle}
            </h1>
            <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 28 }}>
              {displaySubtitle}
            </p>
            <button
              onClick={handleSignedIn}
              style={{
                background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none',
                borderRadius: 10, padding: '14px 32px', fontSize: 16,
                fontWeight: 700, cursor: 'pointer', width: '100%',
              }}
            >
              Check in now
            </button>
            <button
              onClick={() => setState('pin-form')}
              style={{
                marginTop: 12, fontSize: 12, color: 'var(--pz-muted)',
                background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Use email + PIN instead
            </button>
          </>
        )}

        {state === 'pin-form' && (
          <>
            <h1 style={{ color: 'var(--pz-text)', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              {displayTitle}
            </h1>
            <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 24 }}>
              Enter the email and 6-digit PIN from your confirmation email.
            </p>
            <form onSubmit={handleEmailPin} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--pz-border)', background: 'var(--pz-surface)',
                    color: 'var(--pz-text)', fontSize: 14, boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--pz-muted)', display: 'block', marginBottom: 4 }}>
                  Check-in PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={pin}
                  onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                  required
                  placeholder="123456"
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--pz-border)', background: 'var(--pz-surface)',
                    color: 'var(--pz-text)', fontSize: 22, fontWeight: 700,
                    letterSpacing: 6, fontFamily: 'monospace', textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none',
                  borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Check in
              </button>
            </form>
            {registrationId && (
              <button
                onClick={() => setState('idle')}
                style={{
                  marginTop: 12, fontSize: 12, color: 'var(--pz-muted)',
                  background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                ← Back
              </button>
            )}
          </>
        )}

        {state === 'loading' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <p style={{ color: 'var(--pz-muted)', fontSize: 15 }}>Checking you in…</p>
          </>
        )}

        {state === 'done' && !result.already_checked_in && (
          <>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ color: 'var(--pz-teal-ink)', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
              You&apos;re checked in!
            </h2>
            {result.attendee_name && (
              <p style={{ color: 'var(--pz-text)', fontSize: 16, marginBottom: 4 }}>
                Welcome, {result.attendee_name}
              </p>
            )}
            {result.event_title && (
              <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>{result.event_title}</p>
            )}
          </>
        )}

        {state === 'done' && result.already_checked_in && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ color: 'var(--pz-text)', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              Already checked in
            </h2>
            {result.attendee_name && (
              <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginBottom: 4 }}>
                {result.attendee_name}
              </p>
            )}
            {result.check_in_time && (
              <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>
                Checked in at{' '}
                {new Date(result.check_in_time).toLocaleTimeString('en-US', {
                  hour: 'numeric', minute: '2-digit',
                })}
              </p>
            )}
          </>
        )}

        {state === 'error' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
            <h2 style={{ color: 'var(--pz-error)', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Check-in failed
            </h2>
            <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>
              {result.error ?? 'Something went wrong. Please see staff for assistance.'}
            </p>
            <button
              onClick={() => setState(registrationId ? 'idle' : 'pin-form')}
              style={{
                marginTop: 12, fontSize: 13, color: 'var(--pz-teal)',
                background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Try again
            </button>
          </>
        )}

        <p style={{ color: 'var(--pz-muted)', fontSize: 11, marginTop: 28 }}>Powered by Prezva</p>
      </div>
    </div>
  )
}
