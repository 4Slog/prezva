'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

export function NearMeButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isActive = !!searchParams.get('lat')

  function handleClick() {
    setError(null)
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('lat', pos.coords.latitude.toFixed(6))
        params.set('lng', pos.coords.longitude.toFixed(6))
        params.set('radius', '50')
        params.delete('city')
        router.push(`/discover?${params.toString()}`)
        setLoading(false)
      },
      () => {
        setError('Location access denied')
        setLoading(false)
      }
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: '0.625rem 1.25rem',
          borderRadius: 8,
          border: isActive ? '2px solid var(--pz-teal)' : '1px solid var(--pz-border)',
          background: isActive ? 'var(--pz-teal)22' : 'var(--pz-surface-2)',
          color: isActive ? 'var(--pz-teal)' : 'var(--pz-muted)',
          fontWeight: 600,
          fontSize: 14,
          cursor: loading ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {loading ? 'Getting location...' : isActive ? 'Near me (50mi)' : 'Near me'}
      </button>
      {error && <span style={{ fontSize: 12, color: 'var(--pz-error)' }}>{error}</span>}
    </div>
  )
}
