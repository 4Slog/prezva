'use client'
import { useState } from 'react'
import { virtualCheckIn } from '@/lib/registration/actions'

interface Props {
  virtualUrl: string
  registrationId: string
}

export function VirtualJoinButton({ virtualUrl, registrationId }: Props) {
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  async function handleJoin() {
    setJoining(true)
    await virtualCheckIn(registrationId).catch(() => {})
    setJoined(true)
    setJoining(false)
    window.open(virtualUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <button
      onClick={handleJoin}
      disabled={joining}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        color: 'var(--color-teal)',
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 14, fontWeight: joined ? 600 : 400,
        textDecoration: 'none', padding: 0,
        opacity: joining ? 0.7 : 1,
      }}
    >
      {joined ? '✓ Joined virtually' : joining ? 'Joining…' : '💻 Join virtually'}
    </button>
  )
}
