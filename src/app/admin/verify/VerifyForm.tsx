'use client'

import { useActionState } from 'react'
import { verifyAdminStepUp } from './actions'

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(verifyAdminStepUp, null)

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          Email
        </label>
        <div style={{ fontSize: 13, color: '#F0F4F8', padding: '10px 12px', background: '#0D1B2A', border: '1px solid #1E3A5F', borderRadius: 8 }}>
          {email}
        </div>
      </div>

      <div>
        <label
          htmlFor="password"
          style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          style={{
            width: '100%',
            fontSize: 13,
            color: '#F0F4F8',
            padding: '10px 12px',
            background: '#0D1B2A',
            border: `1px solid ${state?.error ? 'var(--pz-error)' : '#1E3A5F'}`,
            borderRadius: 8,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {state?.error && (
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--pz-error)' }}>{state.error}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '10px 0',
          borderRadius: 8,
          border: 'none',
          background: pending ? '#0A4A3F' : '#2DD4BF',
          color: '#0D1B2A',
          fontWeight: 700,
          fontSize: 14,
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
        {pending ? 'Verifying…' : 'Confirm access'}
      </button>
    </form>
  )
}
