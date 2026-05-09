import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--pz-bg)' }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[#1E3A5F]">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            P
          </div>
          <span className="text-lg font-bold text-[#F0F4F8]">Prezva</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm font-medium text-[#94A3B8] hover:text-[#F0F4F8] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-8"
          style={{ background: 'rgba(0,191,166,0.1)', border: '1px solid rgba(0,191,166,0.3)', color: 'var(--pz-teal)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#00BFA6]" />
          Now in Beta
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold text-[#F0F4F8] leading-tight max-w-3xl mb-6">
          Event management that{' '}
          <span style={{ color: 'var(--pz-teal)' }}>actually works</span>
        </h1>

        <p className="text-lg text-[#94A3B8] max-w-xl mb-10 leading-relaxed">
          Registration, ticketing, check-in, and attendee management — all in one platform.
          Payments go directly to your bank. No middleman.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="rounded-lg px-8 py-3 text-base font-bold transition-opacity hover:opacity-90 w-full sm:w-auto text-center"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Start free
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-[#1E3A5F] px-8 py-3 text-base font-medium text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6]/40 transition-colors w-full sm:w-auto text-center"
          >
            Sign in
          </Link>
        </div>
      </main>

      {/* Feature strip */}
      <section className="border-t border-[#1E3A5F] px-6 py-12">
        <div className="mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { icon: '🎟️', label: 'Ticketing',     detail: 'Free, paid & donation' },
            { icon: '✅', label: 'QR Check-in',   detail: 'Works offline too' },
            { icon: '💳', label: 'Direct payouts', detail: 'Straight to your bank' },
            { icon: '📊', label: 'Analytics',      detail: 'Real-time dashboards' },
          ].map((f) => (
            <div key={f.label}>
              <div className="text-3xl mb-2">{f.icon}</div>
              <p className="text-sm font-semibold text-[#F0F4F8]">{f.label}</p>
              <p className="text-xs text-[#64748B] mt-0.5">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Offline sync callout */}
      <section className="border-t border-[#1E3A5F] px-6 py-10">
        <div className="mx-auto max-w-2xl flex items-center gap-4 pz-card p-5 pz-glow-teal">
          <span className="pz-dot-online h-3 w-3 flex-shrink-0 rounded-full" />
          <div>
            <p className="text-sm font-semibold text-[#F0F4F8]">Built offline-first</p>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Check-in keeps working even when venue WiFi dies. Data syncs automatically when you reconnect.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1E3A5F] px-6 py-6 flex items-center justify-between">
        <p className="text-xs text-[#64748B]">© 2026 Prezva. All rights reserved.</p>
        <p className="text-xs text-[#64748B]">Check in. Stand out.</p>
      </footer>

    </div>
  )
}
