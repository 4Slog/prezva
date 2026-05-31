'use client'

import { useEffect, useState } from 'react'
import {
  LiveKitRoom,
  VideoConference,
  useTracks,
  useParticipants,
  useRoomContext,
  ParticipantTile,
} from '@livekit/components-react'
import { Track, RoomEvent, type Participant } from 'livekit-client'
import ModeratorControls from './ModeratorControls'

interface Props {
  roomName: string
  sessionId: string
  participantName: string
  isOrganizer: boolean
  onParticipantCountChange?: (count: number) => void
}

export default function LiveRoom({
  roomName: _roomName,
  sessionId,
  participantName: _participantName,
  isOrganizer,
  onParticipantCountChange,
}: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/video/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    })
      .then(async res => {
        const data = await res.json()
        if (data.token) {
          setToken(data.token)
        } else {
          setTokenError(data.error ?? 'Failed to get token')
        }
      })
      .catch(() => setTokenError('Failed to connect to video room'))
  }, [sessionId])

  if (tokenError) {
    return (
      <div style={placeholderStyle}>
        <p style={{ color: '#ef4444', fontSize: 14 }}>{tokenError}</p>
      </div>
    )
  }

  if (!token) {
    return (
      <div style={{ ...placeholderStyle, gap: 10 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', background: '#2DD4BF',
          animation: 'lkPulse 1.2s ease-in-out infinite',
        }} />
        <p style={{ color: '#888', fontSize: 14 }}>Connecting...</p>
        <style>{`@keyframes lkPulse{0%,100%{opacity:1}50%{opacity:.2}}`}</style>
      </div>
    )
  }

  return (
    <LiveKitRoom
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      token={token}
      connect={true}
      style={{ width: '100%', borderRadius: 8, overflow: 'hidden', background: '#0a0a0a' }}
    >
      {isOrganizer ? (
        <>
          <VideoConference style={{ minHeight: 480 }} />
          <ModeratorControls sessionId={sessionId} />
        </>
      ) : (
        <AudienceLayout onParticipantCountChange={onParticipantCountChange} />
      )}
    </LiveKitRoom>
  )
}

const placeholderStyle: React.CSSProperties = {
  width: '100%',
  aspectRatio: '16/9',
  background: '#0a0a0a',
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function AudienceLayout({
  onParticipantCountChange,
}: {
  onParticipantCountChange?: (count: number) => void
}) {
  const room = useRoomContext()
  const participants = useParticipants()
  const tracks = useTracks([Track.Source.Camera])
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null)

  useEffect(() => {
    onParticipantCountChange?.(participants.length)
  }, [participants.length, onParticipantCountChange])

  useEffect(() => {
    const handler = (speakers: Participant[]) => {
      setActiveSpeakerId(speakers[0]?.identity ?? null)
    }
    room.on(RoomEvent.ActiveSpeakersChanged, handler)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handler)
    }
  }, [room])

  if (tracks.length === 0) {
    return (
      <div style={{ ...placeholderStyle, background: '#111' }}>
        <p style={{ color: '#666', fontSize: 14 }}>Waiting for presenter...</p>
      </div>
    )
  }

  const dominant =
    tracks.find(t => t.participant.identity === activeSpeakerId) ?? tracks[0]
  const strip = tracks.filter(t => t !== dominant)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
      <div style={{ width: '100%', borderRadius: 6, overflow: 'hidden' }}>
        <ParticipantTile
          trackRef={dominant}
          style={{ width: '100%', aspectRatio: '16/9' }}
        />
      </div>
      {strip.length > 0 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {strip.map(t => (
            <div
              key={t.participant.identity}
              style={{ flexShrink: 0, width: 160, borderRadius: 6, overflow: 'hidden' }}
            >
              <ParticipantTile
                trackRef={t}
                style={{ width: '100%', aspectRatio: '16/9' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
