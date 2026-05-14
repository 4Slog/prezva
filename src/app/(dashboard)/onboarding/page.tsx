import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Get Started',
}

const VALUES = [
  'Launch your first event page in under 5 minutes — no design skills needed',
  'Built-in QR check-in that works offline, so venue WiFi problems are never your problem',
  'Payments go directly to your Stripe account — no middleman holding your revenue',
]

export default function OnboardingPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-16"
      style={{ background: 'var(--pz-bg)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-10 text-center"
        style={{
          background: 'var(--pz-surface)',
          border: '1px solid var(--pz-border)',
          boxShadow: '0 0 40px rgba(0,191,166,0.08)',
        }}
      >
        <div
          className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          P
        </div>

        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>
          Welcome to Prezva
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--pz-text-muted)' }}>
          Here's what you can do right now:
        </p>

        <ul className="space-y-4 text-left mb-10">
          {VALUES.map((v) => (
            <li key={v} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: 'rgba(0,191,166,0.15)', color: 'var(--pz-teal)' }}
              >
                ✓
              </span>
              <span className="text-sm leading-relaxed" style={{ color: 'var(--pz-text)' }}>{v}</span>
            </li>
          ))}
        </ul>

        <Link
          href="/events/new"
          className="block w-full rounded-lg py-3 text-base font-bold transition-opacity hover:opacity-90 text-center"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Create your first event
        </Link>

        <p className="mt-6 text-xs" style={{ color: 'var(--pz-text-muted)' }}>
          Already have an event?{' '}
          <Link href="/events" className="hover:opacity-80 transition-opacity" style={{ color: 'var(--pz-teal)' }}>
            View your events
          </Link>
        </p>
      </div>
    </div>
  )
}
