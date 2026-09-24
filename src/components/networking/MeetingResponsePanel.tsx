'use client'

import { useState } from 'react'
import { useDeviceTimeZone } from '@/components/events/useDeviceTimeZone'
import { formatProposedTime, zonedInputToIso } from '@/lib/datetime/zoned-input'
import { TimezoneOptions } from '@/components/events/TimezoneOptions'
import { respondToMeetingRequest } from '@/lib/networking/sprint8-actions'
import { Avatar } from '@/components/identity/Avatar'
import { HandleTag } from '@/components/identity/HandleTag'

interface Props {
  requestId: string
  requesterName: string
  requesterAvatarUrl?: string | null
  requesterHandle?: string | null
  message: string | null
  // R89: { at, tz } entries; legacy rows hold naive strings.
  proposedTimes: unknown[]
  initialStatus: string
}

export function MeetingResponsePanel({ requestId, requesterName, requesterAvatarUrl, requesterHandle, message, proposedTimes, initialStatus }: Props) {
  // The viewer's own zone, known only in the browser (null during SSR → proposed zone only).
  const viewerTz = useDeviceTimeZone()
  const [status, setStatus] = useState(initialStatus)
  const [showCounter, setShowCounter] = useState(false)
  const [counterTime, setCounterTime] = useState('')
  const [counterNote, setCounterNote] = useState('')
  // R89: the counter is proposed in the responder's device zone unless they pick another.
  const [pickedTz, setPickedTz] = useState<string | null>(null)
  const counterTz = pickedTz ?? viewerTz ?? 'UTC'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: 'accepted' | 'declined' | 'counter') {
    setError(null)
    let counter: { at: string; tz: string } | undefined
    if (response === 'counter') {
      if (!counterTime) { setShowCounter(true); return }
      try {
        counter = { at: zonedInputToIso(counterTime, counterTz), tz: counterTz }
      } catch {
        setError('Enter a valid date and time')
        return
      }
    }
    setBusy(true)
    const res = await respondToMeetingRequest(requestId, response, counter, response === 'counter' ? counterNote : undefined)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setStatus(res.status)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Avatar name={requesterName} avatarUrl={requesterAvatarUrl} size={32} />
        <div>
          <p style={{ color: 'var(--pz-label)', fontSize: 12, fontWeight: 600 }}>
            Meeting request from {requesterName}
          </p>
          <HandleTag handle={requesterHandle} />
        </div>
      </div>
      {message && <p style={{ color: 'var(--pz-muted)', fontSize: 13, marginBottom: 8 }}>{message}</p>}
      {proposedTimes.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {proposedTimes.map((t, i) => (
            <p key={i} style={{ color: 'var(--pz-text)', fontSize: 12, marginBottom: 2 }}>• {formatProposedTime(t, viewerTz)}</p>
          ))}
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--pz-error)', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      {showCounter ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="datetime-local"
              aria-label="Suggested time"
              value={counterTime}
              onChange={e => setCounterTime(e.target.value)}
              style={{ flex: 1, background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 10px', color: 'var(--pz-text)', fontSize: 13 }}
            />
            <select
              aria-label="Time zone"
              value={counterTz}
              onChange={e => setPickedTz(e.target.value)}
              style={{ background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 6, padding: '8px 6px', color: 'var(--pz-text)', fontSize: 12 }}
            >
              <TimezoneOptions current={counterTz} />
            </select>
          </div>
          <input
            type="text"
            aria-label="Note (optional)"
            placeholder="Note (optional), e.g. at the networking lounge"
            value={counterNote}
            maxLength={500}
            onChange={e => setCounterNote(e.target.value)}
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
