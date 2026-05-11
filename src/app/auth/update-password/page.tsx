'use client'

import { useActionState } from 'react'
import { updatePassword } from '@/lib/auth/actions'

export default function UpdatePasswordPage() {
  const [state, formAction] = useActionState(updatePassword, {})

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--pz-bg)' }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8"
        style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
      >
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Set new password</h1>
        </div>

        {state?.error && (
          <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--pz-error)' }}>
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
              New password
            </label>
            <input
              id="password" name="password" type="password" required minLength={8}
              placeholder="Min. 8 characters"
              className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg py-2 px-4 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  )
}
