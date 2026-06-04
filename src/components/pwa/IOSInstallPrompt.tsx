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
    <div className="fixed bottom-4 left-4 right-4 bg-[#1E3A5F] rounded-xl p-4 shadow-xl z-50 border border-[#2DD4BF]/20">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-semibold text-[#F0F4F8]">Add Prezva to Home Screen</p>
        <button
          onClick={() => { localStorage.setItem('ios-install-dismissed', '1'); setShow(false) }}
          className="text-[#64748B] text-lg leading-none ml-3"
        >
          ×
        </button>
      </div>
      <p className="text-xs text-[#94A3B8]">
        Tap <strong className="text-[#F0F4F8]">Share</strong> then <strong className="text-[#F0F4F8]">Add to Home Screen</strong> for the best experience.
      </p>
    </div>
  )
}
