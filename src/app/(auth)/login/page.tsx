'use client'

import { useActionState } from 'react'
import { signIn } from '@/lib/auth/actions'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'

export default function LoginPage() {
  const [state, formAction] = useActionState(signIn, {})

  return (
    <div
      className="rounded-xl p-8"
      style={{
        background: 'var(--pz-surface)',
        border: '1px solid var(--pz-border)',
      }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Welcome back</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-text-muted)' }}>
          Sign in to your Prezva account
        </p>
      </div>

      <GoogleOAuthButton mode="signin" />

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

      <form action={formAction} className="space-y-4">
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
            id="password" name="password" type="password" required autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </div>
        <div className="flex justify-end">
          <a href="/forgot-password" className="text-sm hover:underline" style={{ color: 'var(--pz-teal)' }}>
            Forgot password?
          </a>
        </div>
        <button
          type="submit"
          className="w-full rounded-lg px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-center text-sm" style={{ color: 'var(--pz-text-muted)' }}>
        Don&apos;t have an account?{' '}
        <a href="/signup" className="font-medium hover:underline" style={{ color: 'var(--pz-teal)' }}>
          Sign up
        </a>
      </p>
    </div>
  )
}
