'use client'

import { useRef, useState } from 'react'
import MuxPlayer from '@mux/mux-player-react'

interface Props {
  playbackId: string
  sessionTitle: string
  isLive: boolean
  viewerCount?: number
  registrationId: string
  sessionId: string
  onProgress?: (watchedSeconds: number) => void
}

export default function LivePlayer({
  playbackId,
  sessionTitle,
  isLive,
  viewerCount,
  registrationId,
  sessionId,
  onProgress,
}: Props) {
  const watchedRef = useRef(0)
  const lastReportRef = useRef(0)
  const [muted, setMuted] = useState(true)

  function handleTimeUpdate(e: Event) {
    const video = (e.target as HTMLVideoElement)
    if (!video) return
    const current = Math.floor(video.currentTime)
    if (current > watchedRef.current) {
      watchedRef.current = current
    }
    if (onProgress && watchedRef.current - lastReportRef.current >= 10) {
      const delta = watchedRef.current - lastReportRef.current
      lastReportRef.current = watchedRef.current
      onProgress(delta)
    }
  }

  return (
    <div style={{
      position: 'relative', width: '100%', aspectRatio: '16/9',
      // eslint-disable-next-line no-restricted-syntax -- video player letterbox bg — behind <MuxPlayer> / <video> element
      background: '#000',
      borderRadius: 8, overflow: 'hidden',
    }}>
      <MuxPlayer
        playbackId={playbackId}
        streamType={isLive ? 'll-live' : 'on-demand'}
        autoPlay={muted ? 'muted' : undefined}
        muted={muted}
        style={{ width: '100%', height: '100%' }}
        metadata={{
          video_id: sessionId,
          video_title: sessionTitle,
          viewer_user_id: registrationId,
        }}
        onTimeUpdate={handleTimeUpdate as unknown as EventListener}
        onVolumeChange={((e: Event) => {
          if (!(e.target as HTMLVideoElement).muted) setMuted(false)
        }) as unknown as EventListener}
      />

      {isLive && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '3px 8px',
          pointerEvents: 'none',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--pz-error)',
            animation: 'livePulse 1.4s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-chrome-text)', letterSpacing: 1 }}>LIVE</span>
        </div>
      )}

      {(viewerCount ?? 0) > 0 && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '3px 8px',
          fontSize: 11, color: 'var(--pz-chrome-text)', pointerEvents: 'none',
        }}>
          {viewerCount} watching
        </div>
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
