'use client'

import { useState } from 'react'

interface Props {
  mode?: 'signin' | 'signup'
}

const ENABLED = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === '1'

export function GoogleOAuthButton({ mode = 'signin' }: Props) {
  const [showTip, setShowTip] = useState(false)
  const label = mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'

  if (ENABLED) {
    return (
      <a
        href={`/auth/google?next=${mode === 'signup' ? '/onboarding' : '/dashboard'}`}
        className="flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--pz-surface-2)]"
        style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}
      >
        <GoogleG />
        {label}
      </a>
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled
        aria-describedby="google-coming-soon"
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onFocus={() => setShowTip(true)}
        onBlur={() => setShowTip(false)}
        className="flex w-full items-center justify-center gap-3 rounded-lg border px-4 py-2 text-sm font-medium opacity-50 cursor-not-allowed"
        style={{ borderColor: 'var(--pz-border)', color: 'var(--pz-text)' }}
      >
        <GoogleG />
        {label}
      </button>
      {showTip && (
        <div
          id="google-coming-soon"
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 -top-10 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap z-10"
          style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', color: 'var(--pz-text-muted)' }}
        >
          Google sign-in coming soon — use email for now
        </div>
      )}
    </div>
  )
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
    </svg>
  )
}
