'use client'

import { useState } from 'react'

export function IOSInstallPrompt() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    const isStandalone = (window.navigator as any).standalone === true
    const dismissed = localStorage.getItem('ios-install-dismissed')
    return isIOS && !isStandalone && !dismissed
  })

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-[var(--pz-surface-2)] rounded-xl p-4 shadow-xl z-50 border border-[var(--pz-teal)]/20">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-semibold text-[var(--pz-text)]">Add Prezva to Home Screen</p>
        <button
          onClick={() => { localStorage.setItem('ios-install-dismissed', '1'); setShow(false) }}
          className="text-[var(--pz-muted)] text-lg leading-none ml-3"
        >
          ×
        </button>
      </div>
      <p className="text-xs text-[var(--pz-muted)]">
        Tap <strong className="text-[var(--pz-text)]">Share</strong> then <strong className="text-[var(--pz-text)]">Add to Home Screen</strong> for the best experience.
      </p>
    </div>
  )
}
