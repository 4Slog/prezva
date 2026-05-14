'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

const AUTH_PREFIXES = ['/dashboard', '/events', '/orgs', '/e/']

export function OfflineIndicator() {
  const pathname = usePathname()
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false)

  useEffect(() => {
    const handleOnline = () => setOffline(false)
    const handleOffline = () => setOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p))
  if (!offline || !isAuthRoute) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[#F59E0B] text-[#0D1B2A] text-center py-2 text-sm font-semibold">
      You are offline — check-in still works, other features may be limited
    </div>
  )
}
