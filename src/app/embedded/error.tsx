'use client'

export default function EmbeddedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-base font-medium" style={{ color: 'var(--pz-text)' }}>
        Something went wrong
      </p>
      <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
        We hit an unexpected error loading this page. Refresh to try again.
      </p>
      <button
        onClick={reset}
        className="mt-2 rounded-lg px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-80"
        style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
      >
        Try again
      </button>
    </div>
  )
}
