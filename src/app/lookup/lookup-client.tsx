'use client'

import { useState } from 'react'

export function LookupClient() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)
    await fetch('/api/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    setLoading(false)
    setSubmitted(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: '2rem' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ background: 'var(--pz-teal)', width: 40, height: 40, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ color: 'var(--pz-on-accent)', fontWeight: 900, fontSize: 20 }}>P</span>
          </div>
          <h1 style={{ color: 'var(--pz-text)', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Lost your registration?</h1>
          <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>Enter the email you used to register and we&apos;ll resend your confirmation links.</p>
        </div>

        {submitted ? (
          <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: 'var(--pz-teal-ink)', fontWeight: 700, marginBottom: 8 }}>Check your inbox</p>
            <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>
              If we found any registrations for <strong style={{ color: 'var(--pz-text)' }}>{email}</strong>, we&apos;ve sent your links there.
            </p>
            <button
              onClick={() => { setSubmitted(false); setEmail('') }}
              style={{ marginTop: 16, background: 'transparent', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '8px 16px', color: 'var(--pz-muted)', fontSize: 13, cursor: 'pointer' }}
            >
              Try another email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={{
                background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 8,
                padding: '12px 14px', color: 'var(--pz-text)', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', padding: '12px', borderRadius: 8,
                fontWeight: 700, fontSize: 15, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Sending…' : 'Send my registration links'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--pz-muted)' }}>
          <a href="https://prezva.app" style={{ color: 'var(--pz-muted)' }}>← Back to Prezva</a>
        </p>
      </div>
    </div>
  )
}
