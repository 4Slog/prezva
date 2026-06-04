'use client'

import { useState } from 'react'
import { respondToMeetingRequest } from '@/lib/networking/sprint8-actions'

interface Props {
  requestId: string
  requesterName: string
  message: string | null
  proposedTimes: string[]
  initialStatus: string
}

export function MeetingResponsePanel({ requestId, requesterName, message, proposedTimes, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [showCounter, setShowCounter] = useState(false)
  const [counterTime, setCounterTime] = useState('')
  const [busy, setBusy] = useState(false)

  async function respond(response: 'accepted' | 'declined' | 'counter') {
    if (response === 'counter' && !counterTime) { setShowCounter(true); return }
    setBusy(true)
    await respondToMeetingRequest(requestId, response, response === 'counter' ? counterTime : undefined)
    setBusy(false)
    setStatus(response === 'counter' ? 'countered' : response)
    setShowCounter(false)
  }

  if (status === 'accepted') {
    return (
      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-success-bg)', border: '1px solid var(--pz-success)', borderRadius: 8 }}>
        <p style={{ color: 'var(--pz-success)', fontSize: 13, fontWeight: 500 }}>Accepted ✓</p>
      </div>
    )
  }

  if (status === 'declined') {
    return (
      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-border)', borderRadius: 8 }}>
        <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>Declined</p>
      </div>
    )
  }

  if (status === 'countered') {
    return (
      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-surface-2)', borderRadius: 8 }}>
        <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>Counter-proposal sent</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, padding: '14px', background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 8 }}>
      <p style={{ color: 'var(--pz-label)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        Meeting request from {requesterName}
      </p>
      {message && <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 8 }}>{message}</p>}
      {proposedTimes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {proposedTimes.map((t, i) => (
            <p key={i} style={{ color: 'var(--pz-text)', fontSize: 12, marginBottom: 2 }}>• {t}</p>
          ))}
        </div>
      )}
      {showCounter ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            placeholder="e.g. Monday 2pm at the networking lounge"
            value={counterTime}
            onChange={e => setCounterTime(e.target.value)}
            style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => respond('counter')}
              disabled={busy || !counterTime}
              style={{ flex: 1, background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: busy || !counterTime ? 0.6 : 1 }}
            >
              Send counter
            </button>
            <button
              onClick={() => setShowCounter(false)}
              style={{ background: 'transparent', border: '1px solid var(--pz-border)', color: 'var(--pz-muted)', borderRadius: 6, padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => respond('accepted')}
            disabled={busy}
            style={{ flex: 1, background: 'var(--pz-success-bg)', color: 'var(--pz-success)', border: '1px solid var(--pz-success)', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            ✓ Accept
          </button>
          <button
            onClick={() => setShowCounter(true)}
            disabled={busy}
            style={{ flex: 1, background: 'var(--pz-surface)', color: 'var(--pz-text)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}
          >
            ↩ Suggest time
          </button>
          <button
            onClick={() => respond('declined')}
            disabled={busy}
            style={{ flex: 1, background: 'var(--pz-error-bg)', color: 'var(--pz-error)', border: '1px solid var(--pz-error)', borderRadius: 6, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}
          >
            ✗ Decline
          </button>
        </div>
      )}
    </div>
  )
}
