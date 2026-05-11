import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
      style={{ background: 'var(--pz-bg)' }}
    >
      <div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-black"
        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
      >
        P
      </div>
      <h1 className="mb-2 text-7xl font-black" style={{ color: 'var(--pz-teal)' }}>404</h1>
      <p className="mb-2 text-xl font-semibold" style={{ color: 'var(--pz-text)' }}>Page not found</p>
      <p className="mb-8 max-w-sm text-sm" style={{ color: 'var(--pz-muted)' }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Go to Dashboard
        </Link>
        <Link
          href="/"
          className="rounded-lg px-5 py-2.5 text-sm font-semibold"
          style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
        >
          Home
        </Link>
      </div>
      <p className="mt-12 text-xs" style={{ color: 'var(--pz-label)' }}>
        Need help? <a href="mailto:support@prezva.app" className="hover:underline" style={{ color: 'var(--pz-teal)' }}>Contact support</a>
      </p>
    </div>
  )
}
