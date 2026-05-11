'use client'

import { useActionState } from 'react'
import { resetPassword } from '@/lib/auth/actions'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(resetPassword, {})

  return (
    <div
      className="rounded-xl p-8"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Reset your password</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-muted)' }}>We&apos;ll send you a link to reset it</p>
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

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Email
          </label>
          <input
            id="email" name="email" type="email" required
            placeholder="you@example.com"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
            style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
          />
        </div>
        <button
          type="submit"
          className="w-full rounded-lg py-2 px-4 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          Send reset link
        </button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="hover:underline" style={{ color: 'var(--pz-teal)' }}>
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
