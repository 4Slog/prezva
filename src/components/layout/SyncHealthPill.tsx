'use client'

import { useState, useEffect } from 'react'

export function SyncHealthPill() {
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function countPending() {
      try {
        const { default: Dexie } = await import('dexie')
        const db = new Dexie('prezva-checkin')
        db.version(1).stores({ pending: '++id' })
        const count = await (db as any).table('pending').count()
        if (!cancelled) setPending(count)
      } catch { /* Dexie not available or no pending table */ }
    }
    countPending()
    const id = setInterval(countPending, 30000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const color = online ? 'var(--pz-teal)' : 'var(--pz-warning-fill)'
  const dotClass = online ? 'bg-[var(--pz-teal)]' : 'bg-[var(--pz-warning-fill)]'
  const label = online
    ? pending > 0 ? `Syncing (${pending} pending)` : 'Online'
    : pending > 0 ? `Offline (${pending} pending)` : 'Offline'

  return (
    <div
      className="pz-glow-teal flex items-center gap-2 rounded-lg px-3 py-2.5"
      style={{
        background: online ? 'var(--pz-teal-bg)' : 'var(--pz-warning-bg)',
        border: online ? '1px solid var(--pz-teal)' : '1px solid var(--pz-warning-fill)',
      }}
    >
      <span className={`${dotClass} h-2.5 w-2.5 flex-shrink-0 rounded-full`} />
      <span className="text-xs font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  )
}
