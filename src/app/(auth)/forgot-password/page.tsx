'use client'

import { useActionState } from 'react'
import { resetPassword } from '@/lib/auth/actions'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState(resetPassword, {})

  return (
    <div
      className="rounded-xl p-8"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Reset your password</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--pz-muted)' }}>
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      {state?.error && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            background: 'var(--pz-error-bg)',
            border: '1px solid var(--pz-error)',
            color: 'var(--pz-error)',
          }}
        >
          {state.error}
        </div>
      )}
      {state?.success && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            background: 'var(--pz-success-bg)',
            border: '1px solid var(--pz-success)',
            color: 'var(--pz-success)',
          }}
        >
          {state.success}
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <input
            id="email" name="email" type="email" required
            placeholder="you@example.com"
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <Button type="submit" className="w-full">Send reset link</Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <a href="/login" style={{ color: 'var(--pz-teal-ink)' }} className="hover:opacity-80 transition-opacity">
          Back to sign in
        </a>
      </p>
    </div>
  )
}
