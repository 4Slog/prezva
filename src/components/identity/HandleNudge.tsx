'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const DISMISS_KEY = 'pz_handle_nudge_dismissed'

export function HandleNudge({ handle, customized }: { handle: string; customized: boolean }) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    if (customized) return
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1')
  }, [customized])

  if (customized || dismissed) return null

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
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
