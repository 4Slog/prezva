'use client'

import { useActionState } from 'react'
import { signUp } from '@/lib/auth/actions'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'

export default function SignupPage() {
  const [state, formAction] = useActionState(signUp, {})

  return (
    <div
      className="rounded-xl p-8"
      style={{
        background: 'var(--pz-surface)',
        border: '1px solid var(--pz-border)',
      }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Create your account</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-text-muted)' }}>
          Set up in minutes. No credit card required.
        </p>
      </div>

      <GoogleOAuthButton mode="signup" />

      <div className="my-5 flex items-center gap-3">
        <div className="flex-1 h-px" style={{ background: 'var(--pz-border)' }} />
        <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--pz-text-muted)' }}>or</span>
        <div className="flex-1 h-px" style={{ background: 'var(--pz-border)' }} />
      </div>

      {state?.error && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: '#3B0000', border: '1px solid #7F1D1D', color: '#FCA5A5' }}
        >
          {state.error}
        </div>
      )}
      {state?.success && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{ background: '#052e16', border: '1px solid #166534', color: '#86efac' }}
        >
          {state.success}
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium mb-1" style={{ color: 'var(--pz-text)' }}>
            Full name
          </label>
          <input
            id="full_name" name="full_name" type="text" required autoComplete="name"
            placeholder="Jane Smith"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: 'var(--pz-text)' }}>
            Email
          </label>
          <input
            id="email" name="email" type="email" required autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1" style={{ color: 'var(--pz-text)' }}>
            Password
          </label>
          <input
            id="password" name="password" type="password" required autoComplete="new-password" minLength={8}
            placeholder="Min. 8 characters"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Create account
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--pz-text-muted)' }}>
        Already have an account?{' '}
        <a href="/login" className="font-medium hover:underline" style={{ color: 'var(--pz-teal)' }}>
          Sign in
        </a>
      </p>
    </div>
  )
}
