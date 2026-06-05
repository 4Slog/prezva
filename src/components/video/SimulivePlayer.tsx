'use client'

import { useRef, useState, useEffect } from 'react'
import MuxPlayer from '@mux/mux-player-react'

interface Props {
  playbackId: string
  scheduledAt: string
  sessionId: string
  registrationId: string
  simuliveStartedAt?: string | null
  onProgress?: (watchedSeconds: number) => void
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':')
}

export default function SimulivePlayer({
  playbackId,
  scheduledAt,
  sessionId,
  registrationId,
  simuliveStartedAt,
  onProgress,
}: Props) {
  const scheduledMs = new Date(scheduledAt).getTime()
  const [now, setNow] = useState(() => Date.now())
  const [started, setStarted] = useState(() => Date.now() >= scheduledMs)
  const watchedRef = useRef(0)
  const lastReportRef = useRef(0)

  // Countdown ticker
  useEffect(() => {
    if (started) return
    const id = setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= scheduledMs) {
        setStarted(true)
        clearInterval(id)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [started, scheduledMs])

  // Compute start offset once on mount — `Date.now()` in a lazy initializer is safe
  const [startTime] = useState(() => {
    if (simuliveStartedAt) {
      return Math.max(0, Math.floor((Date.now() - new Date(simuliveStartedAt).getTime()) / 1000))
    }
    return Math.max(0, Math.floor((Date.now() - scheduledMs) / 1000))
  })

  function handleTimeUpdate(e: Event) {
    const video = e.target as HTMLVideoElement
    if (!video) return
    const current = Math.floor(video.currentTime)
    if (current > watchedRef.current) watchedRef.current = current
    if (onProgress && watchedRef.current - lastReportRef.current >= 10) {
      const delta = watchedRef.current - lastReportRef.current
      lastReportRef.current = watchedRef.current
      onProgress(delta)
    }
  }

  if (!started) {
    return (
      <div style={{
        width: '100%', aspectRatio: '16/9',
        // eslint-disable-next-line no-restricted-syntax -- pre-stream video-area bg — pure black matches the player color at broadcast start (seamless handoff)
        background: '#000',
        borderRadius: 8,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
      }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', margin: 0 }}>
          Broadcast starts in
        </p>
        <p style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--pz-chrome-text)', fontVariantNumeric: 'tabular-nums', margin: 0 }}>
          {formatCountdown(scheduledMs - now)}
        </p>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(239,68,68,0.15)', borderRadius: 4, padding: '4px 10px',
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--pz-error)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-error)', letterSpacing: 1 }}>LIVE SOON</span>
        </div>
      </div>
    )
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
        streamType="on-demand"
        startTime={startTime}
        autoPlay="muted"
        muted
        style={{ width: '100%', height: '100%' }}
        metadata={{
          video_id: sessionId,
          video_title: 'Simulive broadcast',
          viewer_user_id: registrationId,
        }}
        onTimeUpdate={handleTimeUpdate as unknown as EventListener}
      />
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
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
