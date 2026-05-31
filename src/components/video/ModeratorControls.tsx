'use client'

import { useState } from 'react'
import { useMaybeRoomContext, useParticipants } from '@livekit/components-react'
import { MicOff, Star, UserMinus } from 'lucide-react'

interface Props {
  sessionId: string
}

export default function ModeratorControls({ sessionId: _sessionId }: Props) {
  const room = useMaybeRoomContext()
  const participants = useParticipants()
  const [spotlighted, setSpotlighted] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  if (!room) return null

  const remoteParticipants = participants.filter(
    p => p.identity !== room.localParticipant.identity,
  )
  if (remoteParticipants.length === 0) return null

  function handleMute(identity: string) {
    if (!room) return
    if (identity === room.localParticipant.identity) {
      room.localParticipant.setMicrophoneEnabled(false)
    }
    // Remote mute requires LiveKit Admin API — deferred to Batch 6
  }

  function handleSpotlight(identity: string) {
    setSpotlighted(prev => (prev === identity ? null : identity))
  }

  async function handleRemove(identity: string) {
    if (!room) return
    setRemoving(identity)
    try {
      await fetch('/api/video/room/remove-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: room.name, participantIdentity: identity }),
      })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div style={{
      marginTop: 12, padding: '12px 16px',
      background: 'var(--color-surface, #1a1a2e)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
    }}>
      <p style={{
        fontSize: 12, fontWeight: 700, color: '#64748B',
        textTransform: 'uppercase', letterSpacing: 0.8, margin: '0 0 10px',
      }}>
        Participants ({remoteParticipants.length})
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {remoteParticipants.map(p => (
          <div key={p.identity} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 13, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: spotlighted === p.identity ? 'var(--color-teal)' : 'var(--color-text)',
            }}>
              {p.name ?? p.identity}
            </span>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button
                onClick={() => handleMute(p.identity)}
                title="Mute participant"
                style={btnStyle}
              >
                <MicOff size={11} />
              </button>
              <button
                onClick={() => handleSpotlight(p.identity)}
                title="Spotlight participant"
                style={{
                  ...btnStyle,
                  background: spotlighted === p.identity ? 'var(--color-teal)' : undefined,
                  color: spotlighted === p.identity ? '#fff' : undefined,
                  borderColor: spotlighted === p.identity ? 'var(--color-teal)' : undefined,
                }}
              >
                <Star size={11} />
              </button>
              <button
                onClick={() => handleRemove(p.identity)}
                disabled={removing === p.identity}
                title="Remove participant"
                style={{ ...btnStyle, borderColor: '#ef4444', color: '#ef4444' }}
              >
                <UserMinus size={11} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  background: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  color: 'var(--color-text-muted)',
}
