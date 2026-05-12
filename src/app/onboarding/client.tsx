'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function OnboardingAttendeeInput() {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  function handleGo(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const input = value.trim()
    if (!input) return

    // Accept full URLs like https://prezva.app/e/my-event or just a slug
    let slug = input
    try {
      const url = new URL(input)
      const match = url.pathname.match(/^\/e\/([^/]+)/)
      if (match) {
        slug = match[1]
      } else {
        setError('URL must be a Prezva event link (prezva.app/e/...)')
        return
      }
    } catch {
      // Not a URL — treat as raw slug, strip leading slashes
      slug = input.replace(/^\/+/, '').replace(/^e\//, '')
    }

    if (!/^[a-z0-9-]+$/.test(slug)) {
      setError('Invalid event code. Check the link your organizer sent.')
      return
    }

    router.push(`/e/${slug}`)
  }

  return (
    <form onSubmit={handleGo}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          placeholder="Event link or code"
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--pz-bg)',
            border: '1px solid var(--pz-border)',
            borderRadius: 6,
            color: 'var(--pz-text)',
            fontSize: 14,
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 18px',
            background: 'var(--pz-teal)',
            color: '#0D1B2A',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Go →
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6 }}>{error}</p>}
    </form>
  )
}
