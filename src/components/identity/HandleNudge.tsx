'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'pz_handle_nudge_dismissed'

function subscribe() {
  return () => {}
}

function getSnapshot() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

function getServerSnapshot() {
  return true
}

export function HandleNudge({ handle, customized }: { handle: string; customized: boolean }) {
  const storedDismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const [clickDismissed, setClickDismissed] = useState(false)
  const dismissed = storedDismissed || clickDismissed

  if (customized || dismissed) return null

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setClickDismissed(true)
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'var(--pz-teal-bg)',
        border: '1px solid var(--pz-teal)',
        borderRadius: 10,
        padding: '0.75rem 1rem',
        marginBottom: 20,
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--pz-teal-ink)' }}>
        Your handle is <strong>@{handle}</strong> — make it yours.{' '}
        <Link href="/me/profile" style={{ color: 'var(--pz-teal-ink)', textDecoration: 'underline', fontWeight: 600 }}>
          Customize
        </Link>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pz-teal-ink)', fontSize: 16, lineHeight: 1, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  )
}
