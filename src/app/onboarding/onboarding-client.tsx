'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'

type Step = 1 | 2 | 3

export default function OnboardingClient() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [orgName, setOrgName] = useState('')
  const [orgSlug, setOrgSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [inviteCode, setInviteCode] = useState('')
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
        body: JSON.stringify({ name: orgName.trim(), slug: orgSlug.trim(), invite_code: inviteCode.trim() }),
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
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{ fontSize: 28, fontWeight: 900, color: 'var(--pz-teal)', letterSpacing: -1 }}>Prezva</span>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: '2rem' }}>
          {steps.map(s => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex',
                             alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                             background: step >= s.num ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                             color: step >= s.num ? 'var(--pz-on-accent)' : 'var(--pz-muted)' }}>
                {step > s.num ? '✓' : s.num}
              </div>
              {s.num < 3 && <div style={{ width: 40, height: 2,
                                           background: step > s.num ? 'var(--pz-teal)' : 'var(--pz-border)' }} />}
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--pz-surface)', borderRadius: 16, padding: '2rem',
                      border: '1px solid var(--pz-border)' }}>

          {step === 1 && (
            <>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--pz-text)' }}>
                Welcome to Prezva
              </h1>
              <p style={{ color: 'var(--pz-muted)', fontSize: 14, margin: '0 0 1.5rem' }}>
                {"Let's set up your organization. This takes about 2 minutes."}
              </p>
              <div style={{ marginBottom: '1rem' }}>
                <Field label="Organization name" htmlFor="org-name">
                  <input
                    id="org-name"
                    value={orgName}
                    onChange={e => {
                      setOrgName(e.target.value)
                      if (!slugEdited) setOrgSlug(toSlug(e.target.value))
                    }}
                    placeholder="e.g. State Association of Educators"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: 8, fontSize: 15,
                             border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                             color: 'var(--pz-text)', boxSizing: 'border-box' }}
                  />
                </Field>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <Field label="URL slug" htmlFor="org-slug">
                  <div style={{ display: 'flex', alignItems: 'center', background: 'var(--pz-surface-2)',
                                 border: '1px solid var(--pz-border)', borderRadius: 8, overflow: 'hidden' }}>
                    <span style={{ padding: '0.75rem', fontSize: 13, color: 'var(--pz-muted)',
                                    background: 'var(--pz-bg)', flexShrink: 0 }}>
                      prezva.app/o/
                    </span>
                    <input
                      id="org-slug"
                      value={orgSlug}
                      onChange={e => {
                        setOrgSlug(toSlug(e.target.value))
                        setSlugEdited(true)
                      }}
                      style={{ flex: 1, padding: '0.75rem', fontSize: 14, border: 'none',
                               background: 'transparent', color: 'var(--pz-text)', outline: 'none' }}
                    />
                  </div>
                </Field>
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <Field label="Invite code" htmlFor="org-invite">
                  <input
                    id="org-invite"
                    value={inviteCode}
                    onChange={e => setInviteCode(e.target.value)}
                    placeholder="PRZ-ORG-XXXX"
                    autoCapitalize="characters"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: 8, fontSize: 15,
                             border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                             color: 'var(--pz-text)', boxSizing: 'border-box',
                             fontFamily: 'monospace', letterSpacing: 2 }}
                  />
                </Field>
                <p style={{ color: 'var(--pz-muted)', fontSize: 12, margin: '6px 0 0' }}>
                  Required to create your organization.
                </p>
              </div>
              {error && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}
              <Button
                size="lg"
                className="w-full"
                onClick={handleCreateOrg}
                disabled={!orgName.trim() || !inviteCode.trim() || creating}
              >
                {creating ? 'Creating…' : 'Continue →'}
              </Button>
            </>
          )}

          {step === 2 && (
            <>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--pz-text)' }}>
                Create your first event
              </h1>
              <p style={{ color: 'var(--pz-muted)', fontSize: 14, margin: '0 0 1.5rem' }}>
                You can always add more details later. Just give it a name to get started.
              </p>
              <div style={{ marginBottom: '1.5rem' }}>
                <Field label="Event name" htmlFor="event-name">
                  <input
                    id="event-name"
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    placeholder="e.g. Annual Conference 2026"
                    style={{ width: '100%', padding: '0.75rem', borderRadius: 8, fontSize: 15,
                             border: '1px solid var(--pz-border)', background: 'var(--pz-surface-2)',
                             color: 'var(--pz-text)', boxSizing: 'border-box' }}
                  />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => setStep(3)}
                  disabled={!eventTitle.trim()}
                >
                  Continue →
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => setStep(3)}
                  style={{ padding: '0 1rem' }}
                >
                  Skip
                </Button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 8px', color: 'var(--pz-text)' }}>
                  {"You're all set!"}
                </h1>
                <p style={{ color: 'var(--pz-muted)', fontSize: 14, margin: 0 }}>
                  Your organization is ready. Let&apos;s go to your dashboard.
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button size="lg" className="w-full" onClick={() => router.push('/dashboard')}>
                  Go to dashboard →
                </Button>
                {eventTitle && (
                  <Button
                    size="lg"
                    variant="secondary"
                    className="w-full"
                    onClick={() => router.push('/events/new')}
                  >
                    Create &ldquo;{eventTitle}&rdquo; now
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
