'use client'

import { useActionState } from 'react'
import { updatePassword } from '@/lib/auth/actions'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState(updatePassword, {})

  return (
    <div
      className="rounded-xl p-8"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Set new password</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--pz-muted)' }}>
          Choose a new password for your account.
        </p>
      </div>
      {state?.error && (
        <div
          className="mb-4 rounded-lg p-3 text-sm"
          style={{
            background: 'var(--pz-error-bg)',
            border: '1px solid var(--pz-error)',
            color: 'var(--pz-error)',
          }}
        >
          {state.error}
        </div>
      )}
      <form action={formAction} className="space-y-4">
        <Field label="New password" htmlFor="password">
          <input
            id="password" name="password" type="password" required minLength={8}
            placeholder="Min. 8 characters"
            className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pz-teal)]"
            style={{
              background: 'var(--pz-surface-2)',
              border: '1px solid var(--pz-border)',
              color: 'var(--pz-text)',
            }}
          />
        </Field>
        <Button type="submit" className="w-full">Update password</Button>
      </form>
    </div>
  )
}
