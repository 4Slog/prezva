'use client'

import { useMaybeRoomContext, useParticipants } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { MicOff, Star, UserMinus } from 'lucide-react'
import { useState } from 'react'

interface Props {
  sessionId: string
  spotlightedIdentity?: string | null
  onSpotlight?: (id: string | null) => void
}

export default function ModeratorControls({ sessionId: _sessionId, spotlightedIdentity, onSpotlight }: Props) {
  const room = useMaybeRoomContext()
  const participants = useParticipants()
  const [removing, setRemoving] = useState<string | null>(null)
  const [muting, setMuting] = useState<string | null>(null)

  if (!room) return null

  const remoteParticipants = participants.filter(
    p => p.identity !== room.localParticipant.identity,
  )
  if (remoteParticipants.length === 0) return null

  async function handleMute(identity: string) {
    if (!room) return
    if (identity === room.localParticipant.identity) {
      await room.localParticipant.setMicrophoneEnabled(false)
      return
    }
    const remote = room.remoteParticipants.get(identity)
    if (!remote) return
    const micPub = Array.from(remote.trackPublications.values()).find(
      pub => pub.source === Track.Source.Microphone,
    )
    if (!micPub?.trackSid) return
    setMuting(identity)
    try {
      await fetch('/api/video/room/mute-participant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: room.name, participantIdentity: identity, trackSid: micPub.trackSid }),
      })
    } finally {
      setMuting(null)
    }
  }

  function handleSpotlight(identity: string) {
    const next = spotlightedIdentity === identity ? null : identity
    onSpotlight?.(next)
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
        {remoteParticipants.map(p => {
          const isSpotlighted = spotlightedIdentity === p.identity
          return (
            <div key={p.identity} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 13, flex: 1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: isSpotlighted ? 'var(--color-teal)' : 'var(--color-text)',
              }}>
                {p.name ?? p.identity}
              </span>
              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button
                  onClick={() => handleMute(p.identity)}
                  disabled={muting === p.identity}
                  title="Mute participant"
                  style={{ ...btnStyle, opacity: muting === p.identity ? 0.5 : 1 }}
                >
                  <MicOff size={11} />
                </button>
                <button
                  onClick={() => handleSpotlight(p.identity)}
                  title={isSpotlighted ? 'Remove spotlight' : 'Spotlight participant'}
                  style={{
                    ...btnStyle,
                    background: isSpotlighted ? 'var(--color-teal)' : undefined,
                    color: isSpotlighted ? '#fff' : undefined,
                    borderColor: isSpotlighted ? 'var(--color-teal)' : undefined,
                  }}
                >
                  <Star size={11} />
                </button>
                <button
                  onClick={() => handleRemove(p.identity)}
                  disabled={removing === p.identity}
                  title="Remove participant"
                  style={{ ...btnStyle, borderColor: 'var(--pz-error)', color: 'var(--pz-error)', opacity: removing === p.identity ? 0.5 : 1 }}
                >
                  <UserMinus size={11} />
                </button>
              </div>
            </div>
          )
        })}
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
