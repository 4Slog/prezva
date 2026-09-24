'use client'

import { useSyncExternalStore } from 'react'

// The browser's IANA zone. null during SSR and the hydration render, so server
// and client markup match; the real zone arrives right after.
const subscribe = () => () => {}
const deviceZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

export function useDeviceTimeZone(): string | null {
  return useSyncExternalStore(subscribe, deviceZone, () => null)
}
