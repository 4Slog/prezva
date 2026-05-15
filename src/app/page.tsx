import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Prezva — Event Management for Small Organizations',
  description: 'Registration, ticketing, check-in, CE credits, badges, and attendee management — in one affordable platform. Payments go directly to your bank.',
  openGraph: {
    title: 'Prezva — Event Management for Small Organizations',
    description: 'Registration, ticketing, check-in, CE credits, badges, and attendee management — in one affordable platform.',
    url: 'https://prezva.app',
    siteName: 'Prezva',
    type: 'website',
  },
}

const FEATURES = [
  { icon: '🎟️', label: 'Ticketing',         detail: 'Free, paid, donation & member-gated' },
  { icon: '✅', label: 'QR Check-in',        detail: 'Works offline — no WiFi needed' },
  { icon: '💳', label: 'Direct payouts',     detail: 'Stripe Connect — straight to your bank' },
  { icon: '🏅', label: 'Badges & print',     detail: 'Portrait, landscape, thermal ZPL' },
  { icon: '📜', label: 'CE Certificates',    detail: 'PDF delivery + verification URL' },
  { icon: '📢', label: 'Announcements',      detail: 'Email, push & SMS to your attendees' },
  { icon: '📊', label: 'Analytics',          detail: 'Real-time dashboards and exports' },
  { icon: '🤝', label: 'Volunteer module',   detail: 'Roles, shifts, portal & clock-in' },
]

const WHO = [
  'Associations & Nonprofits',
  'Conference Organizers',
  'Workshop Leaders',
  'Training Providers',
  'Community Groups',
  'Trade Show Hosts',
]

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--pz-bg)' }}>

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[#1E3A5F]">
        <Image src="/logo.svg" alt="Prezva" width={148} height={28} />
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
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-6xl font-bold text-[#F0F4F8] leading-tight max-w-3xl mb-6">
          Event management that{' '}
          <span style={{ color: 'var(--pz-teal)' }}>actually works</span>
        </h1>

        <p className="text-lg text-[#94A3B8] max-w-xl mb-10 leading-relaxed">
          From registration to check-in to certificate delivery — in one platform built
          for organizers who don&apos;t have time for complexity.
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

      {/* Offline-first callout */}
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

      {/* Feature strip — 8 items */}
      <section className="border-t border-[#1E3A5F] px-6 py-12">
        <div className="mx-auto max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {FEATURES.map((f) => (
            <div key={f.label}>
              <div className="text-3xl mb-2">{f.icon}</div>
              <p className="text-sm font-semibold text-[#F0F4F8]">{f.label}</p>
              <p className="text-xs text-[#64748B] mt-0.5">{f.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who it's for */}
      <section className="border-t border-[#1E3A5F] px-6 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#64748B] mb-6">
            Who it&apos;s for
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {WHO.map((label) => (
              <span
                key={label}
                className="rounded-full px-4 py-1.5 text-sm font-medium text-[#CBD5E1] border border-[#1E3A5F]"
                style={{ background: 'rgba(0,191,166,0.05)' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing signal */}
      <section className="border-t border-[#1E3A5F] px-6 py-14">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#64748B] mb-4">
            Pricing
          </p>
          <h2 className="text-2xl font-bold text-[#F0F4F8] mb-3">Start free. Grow affordably.</h2>
          <p className="text-[#94A3B8] text-sm leading-relaxed mb-8">
            Prezva is free for small events. Larger events and advanced features start at a flat monthly
            rate — no per-ticket fees eating into your revenue.
          </p>
          <Link
            href="/signup"
            className="rounded-lg px-8 py-3 text-base font-bold transition-opacity hover:opacity-90 inline-block"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Create your first event
          </Link>
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
