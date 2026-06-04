'use client'

import { useActionState } from 'react'
import { verifyAdminStepUp } from './actions'
import { Field } from '@/components/ui/Field'

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(verifyAdminStepUp, null)

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--pz-label)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Email
        </label>
        <div style={{ fontSize: 13, color: 'var(--pz-text)', padding: '10px 12px', background: 'var(--pz-bg)', border: '1px solid var(--pz-border)', borderRadius: 8 }}>
          {email}
        </div>
      </div>

      <Field label="Password" htmlFor="password" error={state?.error ?? undefined}>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          style={{
            width: '100%',
            fontSize: 13,
            color: 'var(--pz-text)',
            padding: '10px 12px',
            background: 'var(--pz-bg)',
            border: `1px solid ${state?.error ? 'var(--pz-error)' : 'var(--pz-border)'}`,
            borderRadius: 8,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: 'var(--pz-teal)',
          color: 'var(--pz-on-accent)',
          fontWeight: 700,
          fontSize: 14,
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? 'Verifying…' : 'Confirm access'}
      </button>
    </form>
  )
}
