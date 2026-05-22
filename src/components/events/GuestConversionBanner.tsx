'use client'
import { useState, useEffect } from 'react'

interface Props {
  regId: string
  email: string
  slug: string
}

export function GuestConversionBanner({ regId, email, slug }: Props) {
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    const key = `pz_guest_banner_dismissed_${regId}`
    if (!sessionStorage.getItem(key)) setDismissed(false)
  }, [regId])

  function dismiss() {
    sessionStorage.setItem(`pz_guest_banner_dismissed_${regId}`, '1')
    setDismissed(true)
  }

  if (dismissed) return null

  return (
    <div style={{
      background: 'var(--pz-surface)', border: '1px solid var(--pz-border)',
      borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap'
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 2px' }}>
          Unlock the full experience
        </p>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>
          Create a free account to access networking, save your sessions, and download your certificate.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <a
          href={`/signup?email=${encodeURIComponent(email)}&next=/e/${slug}`}
          style={{
            display: 'inline-block', padding: '0.625rem 1.25rem', borderRadius: 8,
            background: 'var(--pz-teal)', color: '#0D1B2A', fontWeight: 700,
            fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap'
          }}
        >
          Create free account →
        </a>
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', cursor: 'pointer',
                   color: 'var(--pz-muted)', fontSize: 18, lineHeight: 1, padding: 4 }}
          aria-label="Dismiss"
        >×</button>
      </div>
    </div>
  )
}
