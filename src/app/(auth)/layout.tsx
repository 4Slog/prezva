import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'var(--pz-bg)' }}
    >
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            P
          </div>
          <span className="text-lg font-bold" style={{ color: 'var(--pz-text)' }}>Prezva</span>
        </Link>
        <Link
          href="/"
          className="text-sm transition-colors"
          style={{ color: 'var(--pz-text-muted)' }}
        >
          ← Back to home
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  )
}
