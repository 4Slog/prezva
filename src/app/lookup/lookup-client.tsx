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
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', padding: '2rem' }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ background: '#00BFA6', width: 40, height: 40, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <span style={{ color: '#0D1B2A', fontWeight: 900, fontSize: 20 }}>P</span>
          </div>
          <h1 style={{ color: '#F0F4F8', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>Lost your registration?</h1>
          <p style={{ color: '#94A3B8', fontSize: 14 }}>Enter the email you used to register and we&apos;ll resend your confirmation links.</p>
        </div>

        {submitted ? (
          <div style={{ background: '#112240', border: '1px solid #1E3A5F', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
            <p style={{ color: '#00BFA6', fontWeight: 700, marginBottom: 8 }}>Check your inbox</p>
            <p style={{ color: '#94A3B8', fontSize: 14 }}>
              If we found any registrations for <strong style={{ color: '#F0F4F8' }}>{email}</strong>, we&apos;ve sent your links there.
            </p>
            <button
              onClick={() => { setSubmitted(false); setEmail('') }}
              style={{ marginTop: 16, background: 'transparent', border: '1px solid #1E3A5F', borderRadius: 8, padding: '8px 16px', color: '#94A3B8', fontSize: 13, cursor: 'pointer' }}
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
                background: '#112240', border: '1px solid #1E3A5F', borderRadius: 8,
                padding: '12px 14px', color: '#F0F4F8', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#00BFA6', color: '#0D1B2A', padding: '12px', borderRadius: 8,
                fontWeight: 700, fontSize: 15, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Sending…' : 'Send my registration links'}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#475569' }}>
          <a href="https://prezva.app" style={{ color: '#475569' }}>← Back to Prezva</a>
        </p>
      </div>
    </div>
  )
}
