'use client'

import Image from 'next/image'
import { useState } from 'react'
import { selfCheckInByToken } from '@/lib/checkin/self-checkin-actions'

interface Props { token: string }

export default function SelfCheckInClient({ token }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<{
    attendee_name?: string
    event_title?: string
    event_date?: string
    already_checked_in?: boolean
    check_in_time?: string
    error?: string
    points_awarded?: number
  }>({})

  async function handleCheckIn() {
    setState('loading')
    const res = await selfCheckInByToken(token)
    if (res.success) {
      setResult(res)
      setState('done')
    } else {
      setResult({ error: res.error })
      setState('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--pz-bg)', padding: '2rem',
    }}>
      <div style={{
        maxWidth: 400, width: '100%', background: 'var(--pz-surface)',
        borderRadius: 16, padding: '2.5rem', textAlign: 'center',
        border: '1px solid var(--pz-border)',
      }}>
        {/* Logo mark */}
        <div style={{ marginBottom: '1.5rem' }}>
          <Image src="/logo-mark.svg" width={48} height={48} alt="Prezva" style={{ margin: '0 auto', display: 'block' }} />
        </div>

        {state === 'idle' && (
          <>
            <h1 style={{ color: 'var(--pz-text)', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Check in to your event
            </h1>
            <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginBottom: 28 }}>
              Tap the button below to mark your arrival.
            </p>
            <button
              onClick={handleCheckIn}
              style={{
                background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none',
                borderRadius: 10, padding: '14px 32px', fontSize: 16,
                fontWeight: 700, cursor: 'pointer', width: '100%',
              }}
            >
              Check in now
            </button>
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
              <p style={{ color: 'var(--pz-muted)', fontSize: 14, marginBottom: 2 }}>{result.event_title}</p>
            )}
            {result.event_date && (
              <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>{result.event_date}</p>
            )}
            {!!result.points_awarded && result.points_awarded > 0 && (
              <p style={{ color: 'var(--pz-teal-ink)', fontSize: 15, fontWeight: 700, marginTop: 8 }}>
                +{result.points_awarded} points!
              </p>
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
                Checked in at {new Date(result.check_in_time).toLocaleTimeString('en-US', {
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
          </>
        )}

        {/* Powered by Prezva */}
        <p style={{ color: 'var(--pz-muted)', fontSize: 11, marginTop: 28 }}>
          Powered by Prezva
        </p>
      </div>
    </div>
  )
}
