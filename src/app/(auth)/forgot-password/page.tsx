'use client'

import { useActionState } from 'react'
import { resetPassword } from '@/lib/auth/actions'

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(resetPassword, {})

  return (
    <div
      className="rounded-xl p-8"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Reset your password</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-text-muted)' }}>
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      {state?.error && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          {state.error}
        </div>
      )}
      {state?.success && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{ background: 'rgba(0,191,166,0.1)', border: '1px solid rgba(0,191,166,0.3)', color: 'var(--pz-teal)' }}
        >
          {state.success}
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1" style={{ color: 'var(--pz-text)' }}>
            Email
          </label>
          <input
            id="email" name="email" type="email" required
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{
              background: 'var(--pz-bg)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 px-4 font-semibold rounded-lg transition-opacity hover:opacity-90 text-sm"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Send reset link
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <a href="/login" style={{ color: 'var(--pz-teal)' }} className="hover:opacity-80 transition-opacity">
          Back to sign in
        </a>
      </p>
    </div>
  )
}
