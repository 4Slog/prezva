'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

const AUTH_PREFIXES = ['/dashboard', '/events', '/orgs', '/e/']

export function OfflineIndicator() {
  const pathname = usePathname()
  const [offline, setOffline] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Use a real connectivity probe instead of just navigator.onLine
    // navigator.onLine can be wrong on VPNs / corporate networks
    async function checkConnectivity() {
      if (!navigator.onLine) {
        setOffline(true)
        return
      }
      // Probe with a tiny request to our own health endpoint
      try {
        const res = await fetch('/api/health', { method: 'HEAD', cache: 'no-store' })
        setOffline(!res.ok)
      } catch {
        setOffline(true)
      }
    }

    const handleOnline = () => { checkConnectivity(); setDismissed(false) }
    const handleOffline = () => setOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Only show banner if actually unreachable
    checkConnectivity()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p))
  if (!offline || !isAuthRoute || dismissed) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--pz-warning-fill)] text-[var(--pz-on-accent)] text-center py-2 text-sm font-semibold flex items-center justify-center gap-4">
      <span>You are offline — check-in still works, other features may be limited</span>
      <button
        onClick={() => setDismissed(true)}
        className="text-[var(--pz-on-accent)] opacity-70 hover:opacity-100 font-bold text-base leading-none"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  )
}
