'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SettingsClient({ email }: { email: string }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwStatus, setPwStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [pwError, setPwError] = useState('')
  const [isPending, startTransition] = useTransition()
  const [showDelete, setShowDelete] = useState(false)

  const supabase = createClient()

  function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      setPwError('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setPwError('Password must be at least 8 characters')
      return
    }
    setPwError('')
    startTransition(async () => {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setPwError(error.message)
        setPwStatus('error')
      } else {
        setPwStatus('ok')
        setNewPassword('')
        setConfirmPassword('')
      }
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    background: 'var(--pz-bg)',
    border: '1px solid var(--pz-border)',
    borderRadius: 6,
    color: 'var(--pz-text)',
    fontSize: 14,
    boxSizing: 'border-box',
  }

  return (
    <div>
      {/* Email */}
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12 }}>Email address</h2>
        <input value={email} readOnly style={{ ...inputStyle, opacity: 0.5 }} />
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginTop: 6 }}>
          Email changes require support. Contact us at support@prezva.app.
        </p>
      </div>

      {/* Password */}
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Change password</h2>
        <form onSubmit={changePassword}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setPwStatus('idle') }}
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setPwStatus('idle') }}
              autoComplete="new-password"
              style={inputStyle}
            />
          </div>
          {pwError && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 10 }}>{pwError}</p>}
          {pwStatus === 'ok' && <p style={{ color: 'var(--pz-success-fill)', fontSize: 13, marginBottom: 10 }}>Password updated successfully.</p>}
          <button
            type="submit"
            disabled={isPending || !newPassword}
            style={{ padding: '8px 24px', background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
          >
            {isPending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>

      {/* Two-Factor Auth */}
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 6 }}>Two-factor authentication</h2>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 12 }}>
          Add an extra layer of security to your account.
        </p>
        <button
          style={{ padding: '8px 20px', background: 'var(--pz-bg)', color: 'var(--pz-muted)', border: '1px solid var(--pz-border)', borderRadius: 6, fontSize: 13, cursor: 'not-allowed', opacity: 0.6 }}
          disabled
          title="Coming soon"
        >
          Set up 2FA — coming soon
        </button>
      </div>

      {/* GDPR / Data */}
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 6 }}>Your data</h2>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginBottom: 14 }}>
          Download a copy of your data or request deletion under GDPR/CCPA.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ padding: '8px 16px', background: 'var(--pz-bg)', color: 'var(--pz-muted)', border: '1px solid var(--pz-border)', borderRadius: 6, fontSize: 13, cursor: 'not-allowed', opacity: 0.6 }}
            disabled
            title="Coming soon"
          >
            Export my data
          </button>
          <button
            onClick={() => setShowDelete(v => !v)}
            style={{ padding: '8px 16px', background: 'var(--pz-bg)', color: 'var(--pz-error)', border: '1px solid var(--pz-error)', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}
          >
            Delete account
          </button>
        </div>
        {showDelete && (
          <div style={{ marginTop: 14, padding: '1rem', background: '#ef444411', border: '1px solid var(--pz-error)', borderRadius: 8 }}>
            <p style={{ fontSize: 13, color: 'var(--pz-error)', marginBottom: 8 }}>
              Account deletion is permanent and cannot be undone. All your data will be erased.
            </p>
            <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
              To request deletion, email <strong>support@prezva.app</strong> from your registered address.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
