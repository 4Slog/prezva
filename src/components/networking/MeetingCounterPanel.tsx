'use client'

import { useState } from 'react'
import { useDeviceTimeZone } from '@/components/events/useDeviceTimeZone'
import { formatProposedTime } from '@/lib/datetime/zoned-input'
import { respondToCounterProposal } from '@/lib/networking/sprint8-actions'

interface Props {
  requestId: string
  recipientName: string
  // O134: { at, tz } — shown in the proposed zone, plus the viewer's local time when different.
  counterTime: unknown
  counterNote: string | null
}

// The REQUESTER's side of a counter-proposal: shown on the recipient's profile
// page (where the request was sent from) while the request is 'countered'.
export function MeetingCounterPanel({ requestId, recipientName, counterTime, counterNote }: Props) {
  const viewerTz = useDeviceTimeZone()
  const [status, setStatus] = useState<'countered' | 'accepted' | 'declined'>('countered')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function respond(response: 'accepted' | 'declined') {
    setError(null)
    setBusy(true)
    const res = await respondToCounterProposal(requestId, response)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setStatus(response)
  }

  if (status === 'accepted') {
    return (
      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-success-bg)', border: '1px solid var(--pz-success)', borderRadius: 8 }}>
        <p style={{ color: 'var(--pz-success)', fontSize: 13, fontWeight: 500 }}>Meeting confirmed ✓ {formatProposedTime(counterTime, viewerTz)}</p>
      </div>
    )
  }
  if (status === 'declined') {
    return (
      <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--pz-border)', borderRadius: 8 }}>
        <p style={{ color: 'var(--pz-muted)', fontSize: 13 }}>Counter-proposal declined</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 12, padding: 14, background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', borderRadius: 8 }}>
      <p style={{ color: 'var(--pz-label)', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
        {recipientName} suggested a different time
      </p>
      <p style={{ color: 'var(--pz-text)', fontSize: 13, marginBottom: 4 }}>{formatProposedTime(counterTime, viewerTz)}</p>
      {counterNote && <p style={{ color: 'var(--pz-muted)', fontSize: 12, marginBottom: 8 }}>{counterNote}</p>}
      {error && <p role="alert" style={{ color: 'var(--pz-error)', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => respond('accepted')}
          disabled={busy}
          style={{ flex: 1, background: 'var(--pz-success-bg)', color: 'var(--pz-success)', border: '1px solid var(--pz-success)', borderRadius: 6, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          ✓ Accept
        </button>
        <button
          onClick={() => respond('declined')}
          disabled={busy}
          style={{ flex: 1, background: 'var(--pz-error-bg)', color: 'var(--pz-error)', border: '1px solid var(--pz-error)', borderRadius: 6, padding: '8px 0', fontSize: 12, cursor: 'pointer' }}
        >
          ✗ Decline
        </button>
      </div>
    </div>
  )
}
