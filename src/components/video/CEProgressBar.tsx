'use client'

import { useState, useCallback, useEffect } from 'react'
import { CheckCircle } from 'lucide-react'

interface Props {
  ceCredits: number
  sessionDurationSeconds: number
  onProgress?: (pct: number) => void
}

export interface CEProgressBarHandle {
  addSeconds: (seconds: number) => void
}

export default function CEProgressBar({ ceCredits, sessionDurationSeconds, onProgress }: Props) {
  const [watchedSeconds, setWatchedSeconds] = useState(0)

  const addSeconds = useCallback((seconds: number) => {
    setWatchedSeconds(prev => {
      const next = prev + seconds
      if (onProgress && sessionDurationSeconds > 0) {
        onProgress(Math.min(100, (next / sessionDurationSeconds) * 100))
      }
      return next
    })
  }, [sessionDurationSeconds, onProgress])

  useEffect(() => {
    (CEProgressBar as any)._addSeconds = addSeconds
  }, [addSeconds])

  const threshold = sessionDurationSeconds * 0.8
  const barPct = threshold > 0 ? Math.min(100, (watchedSeconds / threshold) * 100) : 0
  const watchPct = sessionDurationSeconds > 0 ? (watchedSeconds / sessionDurationSeconds) * 100 : 0
  const earned = watchPct >= 80

  return (
    <div style={{ padding: '12px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        {earned ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#2DD4BF' }}>
            <CheckCircle size={15} /> CE credit earned — {ceCredits} credit{ceCredits !== 1 ? 's' : ''}
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {Math.round(watchPct)}% watched — watch 80% to earn {ceCredits} CE credit{ceCredits !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${barPct}%`,
            borderRadius: 3,
            background: earned ? '#2DD4BF' : 'var(--color-text-muted)',
            transition: 'width 0.4s ease, background 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

export function makeCEProgressUpdater(
  setWatched: React.Dispatch<React.SetStateAction<number>>,
  sessionDurationSeconds: number,
  onProgress?: (pct: number) => void,
) {
  return (seconds: number) => {
    setWatched(prev => {
      const next = prev + seconds
      if (onProgress && sessionDurationSeconds > 0) {
        onProgress(Math.min(100, (next / sessionDurationSeconds) * 100))
      }
      return next
    })
  }
}
