'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Step = 1 | 2 | 3

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  function toSlug(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreateOrg() {
    if (!orgName.trim() || !orgSlug.trim()) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName.trim(), slug: orgSlug.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create organization'); setCreating(false); return }
      setStep(2)
    } catch {
      setError('Something went wrong')
    }
    setCreating(false)
  }

  const steps = [
    { num: 1, label: 'Your organization' },
    { num: 2, label: 'First event' },
    { num: 3, label: "You're ready!" },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0D1B2A', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: '#2DD4BF', letterSpacing: -1 }}>Prezva</span>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '2rem' }}>
          {steps.map(s => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex',
                             alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                             background: step >= s.num ? '#2DD4BF' : '#1E3A5F',
                             color: step >= s.num ? '#0D1B2A' : '#64748B' }}>
                {step > s.num ? '✓' : s.num}
              </div>
              {s.num < 3 && <div style={{ width: 40, height: 2,
                                           background: step > s.num ? '#2DD4BF' : '#1E3A5F' }} />}
            </div>
          ))}
        </div>

        <div style={{ background: '#1E3A5F33', borderRadius: 16, padding: '2rem',
                      border: '1px solid rgba(255,255,255,0.08)' }}>

          {step === 1 && (
            <>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px' }}>
                Welcome to Prezva
              </h1>
              <p style={{ color: '#94A3B8', fontSize: 14, margin: '0 0 1.5rem' }}>
                {"Let's set up your organization. This takes about 2 minutes."}
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600,
                                 color: '#94A3B8', marginBottom: 6 }}>
                  Organization name
                </label>
                <input
                  value={orgName}
                  onChange={e => {
                    setOrgName(e.target.value)
                    // Only auto-fill slug while the user hasn't manually edited it.
                    if (!slugEdited) setOrgSlug(toSlug(e.target.value))
                  }}
                  placeholder="e.g. State Association of Educators"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 8, fontSize: 15,
                           border: '1px solid rgba(255,255,255,0.15)', background: '#0D1B2A',
                           color: '#F0F4F8', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600,
                                 color: '#94A3B8', marginBottom: 6 }}>
                  URL slug
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#0D1B2A',
                               border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden' }}>
                  <span style={{ padding: '0.75rem', fontSize: 13, color: '#64748B',
                                  background: '#1E3A5F', flexShrink: 0 }}>
                    prezva.app/o/
                  </span>
                  <input
                    value={orgSlug}
                    onChange={e => {
                      setOrgSlug(toSlug(e.target.value))
                      setSlugEdited(true)
                    }}
                    style={{ flex: 1, padding: '0.75rem', fontSize: 14, border: 'none',
                             background: 'transparent', color: '#F0F4F8', outline: 'none' }}
                  />
                </div>
              </div>
              {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <button
                onClick={handleCreateOrg}
                disabled={!orgName.trim() || creating}
                style={{ width: '100%', padding: '0.875rem', borderRadius: 10, fontWeight: 800,
                         fontSize: 16, border: 'none', background: '#2DD4BF', color: '#0D1B2A',
                         cursor: 'pointer', opacity: !orgName.trim() || creating ? 0.5 : 1 }}>
                {creating ? 'Creating…' : 'Continue →'}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px' }}>
                Create your first event
              </h1>
              <p style={{ color: '#94A3B8', fontSize: 14, margin: '0 0 1.5rem' }}>
                You can always add more details later. Just give it a name to get started.
              </p>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600,
                                 color: '#94A3B8', marginBottom: 6 }}>
                  Event name
                </label>
                <input
                  value={eventTitle}
                  onChange={e => setEventTitle(e.target.value)}
                  placeholder="e.g. Annual Conference 2026"
                  style={{ width: '100%', padding: '0.75rem', borderRadius: 8, fontSize: 15,
                           border: '1px solid rgba(255,255,255,0.15)', background: '#0D1B2A',
                           color: '#F0F4F8', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStep(3)}
                  disabled={!eventTitle.trim()}
                  style={{ flex: 1, padding: '0.875rem', borderRadius: 10, fontWeight: 800,
                           fontSize: 16, border: 'none', background: '#2DD4BF', color: '#0D1B2A',
                           cursor: 'pointer', opacity: !eventTitle.trim() ? 0.5 : 1 }}>
                  Continue →
                </button>
                <button
                  onClick={() => setStep(3)}
                  style={{ padding: '0.875rem 1rem', borderRadius: 10, fontSize: 14,
                           border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                           color: '#94A3B8', cursor: 'pointer' }}>
                  Skip
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px' }}>
                  {"You're all set!"}
                </h1>
                <p style={{ color: '#94A3B8', fontSize: 14, margin: 0 }}>
                  Your organization is ready. Let&apos;s go to your dashboard.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => router.push('/dashboard')}
                  style={{ width: '100%', padding: '0.875rem', borderRadius: 10, fontWeight: 800,
                           fontSize: 16, border: 'none', background: '#2DD4BF', color: '#0D1B2A',
                           cursor: 'pointer' }}>
                  Go to dashboard →
                </button>
                {eventTitle && (
                  <button
                    onClick={() => router.push('/events/new')}
                    style={{ width: '100%', padding: '0.875rem', borderRadius: 10, fontSize: 14,
                             border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
                             color: '#94A3B8', cursor: 'pointer' }}>
                    Create &ldquo;{eventTitle}&rdquo; now
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
