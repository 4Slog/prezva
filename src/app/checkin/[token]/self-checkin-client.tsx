'use client'

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
      background: '#0D1B2A', padding: '2rem',
    }}>
      <div style={{
        maxWidth: 400, width: '100%', background: '#162032',
        borderRadius: 16, padding: '2.5rem', textAlign: 'center',
        border: '1px solid #1E3A5F',
      }}>
        {/* Logo mark */}
        <div style={{ marginBottom: '1.5rem' }}>
          <svg viewBox="0 0 120 96" width={48} height={48} style={{ margin: '0 auto' }}>
            <path d="M 20 88 L 20 44 C 20 8 100 8 100 44 C 100 58 96 66 88 72 L 76 80 L 100 54"
              stroke="#00BFA6" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </div>

        {state === 'idle' && (
          <>
            <h1 style={{ color: '#F0F4F8', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Check in to your event
            </h1>
            <p style={{ color: '#94A3B8', fontSize: 14, marginBottom: 28 }}>
              Tap the button below to mark your arrival.
            </p>
            <button
              onClick={handleCheckIn}
              style={{
                background: '#00BFA6', color: '#0D1B2A', border: 'none',
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
            <p style={{ color: '#94A3B8', fontSize: 15 }}>Checking you in…</p>
          </>
        )}

        {state === 'done' && !result.already_checked_in && (
          <>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ color: '#00BFA6', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
              You&apos;re checked in!
            </h2>
            {result.attendee_name && (
              <p style={{ color: '#F0F4F8', fontSize: 16, marginBottom: 4 }}>
                Welcome, {result.attendee_name}
              </p>
            )}
            {result.event_title && (
              <p style={{ color: '#94A3B8', fontSize: 14, marginBottom: 2 }}>{result.event_title}</p>
            )}
            {result.event_date && (
              <p style={{ color: '#64748B', fontSize: 13 }}>{result.event_date}</p>
            )}
          </>
        )}

        {state === 'done' && result.already_checked_in && (
          <>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <h2 style={{ color: '#F0F4F8', fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
              Already checked in
            </h2>
            {result.attendee_name && (
              <p style={{ color: '#94A3B8', fontSize: 14, marginBottom: 4 }}>
                {result.attendee_name}
              </p>
            )}
            {result.check_in_time && (
              <p style={{ color: '#64748B', fontSize: 13 }}>
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
            <h2 style={{ color: '#EF4444', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Check-in failed
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 14 }}>
              {result.error ?? 'Something went wrong. Please see staff for assistance.'}
            </p>
          </>
        )}

        {/* Powered by Prezva */}
        <p style={{ color: '#334155', fontSize: 11, marginTop: 28 }}>
          Powered by Prezva
        </p>
      </div>
    </div>
  )
}
