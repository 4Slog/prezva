'use client'

import { useState } from 'react'
import { checkInToSession } from '@/lib/checkin/actions'

type Status = 'idle' | 'loading' | 'done' | 'already'

interface Props {
  registrationId: string
  sessionId: string
  sessionStartsAt: string
}

export default function SessionCheckInButton({ registrationId, sessionId, sessionStartsAt }: Props) {
  const [status, setStatus] = useState<Status>('idle')

  if (new Date(sessionStartsAt) > new Date()) return null

  if (status === 'done') {
    return (
      <span style={{ fontSize: 12, color: 'var(--pz-success-fill)', fontWeight: 600, whiteSpace: 'nowrap' }}>
        ✓ Checked in to session
      </span>
    )
  }

  if (status === 'already') {
    return (
      <span style={{ fontSize: 12, color: 'var(--pz-muted)', whiteSpace: 'nowrap' }}>
        Already checked in
      </span>
    )
  }

  async function handleClick() {
    setStatus('loading')
    const result = await checkInToSession(registrationId, sessionId, 'self')
    if (result.ok) {
      setStatus(result.alreadyCheckedIn ? 'already' : 'done')
    } else {
      setStatus('idle')
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      style={{
        fontSize: 12,
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--pz-teal)',
        background: 'transparent',
        color: 'var(--pz-teal)',
        fontWeight: 600,
        cursor: status === 'loading' ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: status === 'loading' ? 0.6 : 1,
      }}
    >
      {status === 'loading' ? '...' : 'Check in to session'}
    </button>
  )
}
