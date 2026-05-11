'use client'

import { useEffect } from 'react'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
      style={{ background: 'var(--pz-bg)' }}
    >
      <div
        className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
        style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--pz-error)' }}
      >
        ⚠
      </div>
      <h1 className="mb-2 text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Something went wrong</h1>
      <p className="mb-8 max-w-sm text-sm" style={{ color: 'var(--pz-muted)' }}>
        An unexpected error occurred. Our team has been notified.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
        >
          Back to Dashboard
        </a>
      </div>
      {error.digest && (
        <p className="mt-8 font-mono text-xs" style={{ color: 'var(--pz-label)' }}>
          Error ID: {error.digest}
        </p>
      )}
    </div>
  )
}
