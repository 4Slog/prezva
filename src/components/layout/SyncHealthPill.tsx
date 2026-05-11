'use client'

import { useState, useEffect } from 'react'
import { getOfflineDB } from '@/lib/checkin/offline-db'

export function SyncHealthPill() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof window !== 'undefined' ? navigator.onLine : true
  )
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    async function checkPending() {
      try {
        const db = getOfflineDB()
        const count = await db.pending.where('synced').equals(0).count()
        setPendingCount(count)
      } catch {
        // Dexie unavailable (SSR guard)
      }
    }

    checkPending()
    const interval = setInterval(checkPending, 10_000)

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
    }
  }, [])

  const label = !isOnline ? 'Offline' : pendingCount > 0 ? `${pendingCount} pending` : 'Synced'
  const pct = !isOnline ? null : pendingCount > 0 ? null : '100%'
  const dotColor = !isOnline ? 'var(--pz-error)' : pendingCount > 0 ? 'var(--pz-warning)' : 'var(--pz-success)'

  return (
    <div
      className="pz-glow-teal flex items-center gap-2 rounded-lg px-3 py-2.5"
      style={{ background: 'rgba(0,191,166,0.08)', border: '1px solid rgba(0,191,166,0.2)' }}
    >
      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full animate-pulse" style={{ background: dotColor }} />
      <span className="text-xs font-medium" style={{ color: 'var(--pz-teal)' }}>
        Offline Sync
      </span>
      <span className="ml-auto text-xs font-bold" style={{ color: dotColor }}>
        {pct ?? label}
      </span>
    </div>
  )
}
