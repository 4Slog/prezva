'use client'

import { useActionState, useState } from 'react'
import { signUp } from '@/lib/auth/actions'
import Link from 'next/link'
import zxcvbn from 'zxcvbn'

const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong']
const STRENGTH_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']

export default function SignupPage() {
  const [state, formAction] = useActionState(signUp, {})
  const [password, setPassword] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  const strength = password.length > 0 ? zxcvbn(password) : null
  const score = strength?.score ?? 0

  return (
    <div
      className="rounded-xl p-8"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Create your account</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-muted)' }}>Start managing events with Prezva</p>
      </div>

      {state?.error && (
        <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--pz-error)' }}>
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: 'var(--pz-success)' }}>
          {state.success}
        </div>
      )}

      <a
        href="/api/auth/google"
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
        style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continue with Google
      </a>

      <div className="relative mb-4 flex items-center gap-3">
        <div className="flex-1 border-t" style={{ borderColor: 'var(--pz-border)' }} />
        <span className="text-xs" style={{ color: 'var(--pz-label)' }}>or</span>
        <div className="flex-1 border-t" style={{ borderColor: 'var(--pz-border)' }} />
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="full_name" className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Full name
          </label>
          <input
            id="full_name" name="full_name" type="text" required autoComplete="name"
            placeholder="Jane Smith"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Email
          </label>
          <input
            id="email" name="email" type="email" required autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Password
          </label>
          <input
            id="password" name="password" type="password" required autoComplete="new-password" minLength={8}
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          />
          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-1 flex-1 rounded-full transition-all duration-300"
                    style={{
                      background: i <= score - 1 ? STRENGTH_COLORS[score] : 'var(--pz-surface-2)',
                    }}
                  />
                ))}
              </div>
              <p className="text-xs" style={{ color: STRENGTH_COLORS[score] }}>
                {STRENGTH_LABELS[score]}
              </p>
            </div>
          )}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            name="accepted_terms"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#00BFA6]"
          />
          <span className="text-xs leading-relaxed" style={{ color: 'var(--pz-muted)' }}>
            I agree to the{' '}
            <Link href="/terms" target="_blank" className="hover:underline" style={{ color: 'var(--pz-teal)' }}>
              Terms of Service
            </Link>
            {' '}and{' '}
            <Link href="/privacy" target="_blank" className="hover:underline" style={{ color: 'var(--pz-teal)' }}>
              Privacy Policy
            </Link>
          </span>
        </label>

        <button
          type="submit"
          disabled={!termsAccepted}
          className="w-full rounded-lg py-2 px-4 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--pz-muted)' }}>
        Already have an account?{' '}
        <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--pz-teal)' }}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
