import Link from 'next/link'
import { requireUser } from '@/lib/auth/get-user'
import { OnboardingAttendeeInput } from './client'

export const metadata = { title: 'Welcome to Prezva' }

export default async function OnboardingPage() {
  await requireUser()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: 'var(--pz-bg)' }}
    >
      <div className="mb-10 text-center">
        <div
          className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-xl font-black mb-4"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          P
        </div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--pz-text)' }}>
          Welcome to Prezva
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--pz-muted)' }}>
          How will you be using Prezva?
        </p>
      </div>

      <div className="grid gap-4 w-full max-w-md">
        <Link
          href="/orgs/new"
          className="pz-card block p-6 text-center hover:border-[var(--pz-teal)] transition-colors group"
          style={{ border: '1px solid var(--pz-border)' }}
        >
          <div className="text-3xl mb-3">🎪</div>
          <h2 className="text-lg font-semibold mb-1 group-hover:text-[var(--pz-teal)] transition-colors" style={{ color: 'var(--pz-text)' }}>
            I&apos;m an event organizer
          </h2>
          <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
            Create and manage events, tickets, speakers, and more.
          </p>
        </Link>

        <div
          className="pz-card block p-6"
          style={{ border: '1px solid var(--pz-border)' }}
        >
          <div className="text-3xl mb-3 text-center">🎟️</div>
          <h2 className="text-lg font-semibold mb-1 text-center" style={{ color: 'var(--pz-text)' }}>
            I&apos;m attending an event
          </h2>
          <p className="text-sm mb-4 text-center" style={{ color: 'var(--pz-muted)' }}>
            Enter the event link or code your organizer shared with you.
          </p>
          <OnboardingAttendeeInput />
        </div>
      </div>

      <p className="mt-8 text-xs" style={{ color: 'var(--pz-muted)' }}>
        Need help?{' '}
        <Link href="/help" style={{ color: 'var(--pz-teal)' }}>
          Visit our Help Center
        </Link>
      </p>
    </div>
  )
}
