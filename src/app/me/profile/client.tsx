'use client'

import { useState, useTransition } from 'react'
import { upsertUserProfile } from '@/lib/attendees/profile-actions'

interface ProfileFields {
  display_name: string
  bio: string
  pronouns: string
  linkedin_url: string
  twitter_url: string
  website_url: string
  show_in_directory: boolean
  interests: string[]
}

export function ProfileClient({ email, initial }: { email: string; initial: ProfileFields }) {
  const [form, setForm] = useState<ProfileFields>(initial)
  const [interestInput, setInterestInput] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function set(k: keyof ProfileFields, v: any) {
    setForm(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  function addInterest() {
    const tag = interestInput.trim().toLowerCase()
    if (!tag || form.interests.includes(tag)) return
    set('interests', [...form.interests, tag])
    setInterestInput('')
  }

  function removeInterest(tag: string) {
    set('interests', form.interests.filter(t => t !== tag))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await upsertUserProfile(form)
      if (res.error) {
        setError(res.error)
      } else {
        setSaved(true)
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--pz-muted)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Basic info</h2>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email (read-only)</label>
          <input value={email} readOnly style={{ ...inputStyle, opacity: 0.5 }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Display name</label>
          <input
            value={form.display_name}
            onChange={e => set('display_name', e.target.value)}
            placeholder="How you appear to other attendees"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Pronouns</label>
          <input
            value={form.pronouns}
            onChange={e => set('pronouns', e.target.value)}
            placeholder="e.g. she/her, he/him, they/them"
            style={{ ...inputStyle, maxWidth: 240 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Bio</label>
          <textarea
            value={form.bio}
            onChange={e => set('bio', e.target.value)}
            placeholder="A short bio visible on your attendee profile"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>

      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Interests</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {form.interests.map(tag => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', fontSize: 12, padding: '3px 10px', borderRadius: 4 }}>
              {tag}
              <button type="button" onClick={() => removeInterest(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={interestInput}
            onChange={e => setInterestInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInterest() } }}
            placeholder="Add an interest"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={addInterest}
            style={{ padding: '8px 16px', background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Social links</h2>
        {([
          { key: 'linkedin_url', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/...' },
          { key: 'twitter_url', label: 'X / Twitter URL', placeholder: 'https://x.com/...' },
          { key: 'website_url', label: 'Website', placeholder: 'https://...' },
        ] as const).map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{f.label}</label>
            <input
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              type="url"
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.25rem 1.5rem', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 2 }}>Show in attendee directory</p>
          <p style={{ fontSize: 12, color: 'var(--pz-muted)' }}>Other attendees can find and connect with you</p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 24, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={form.show_in_directory}
            onChange={e => set('show_in_directory', e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute', inset: 0, background: form.show_in_directory ? 'var(--pz-teal)' : 'var(--pz-border)',
            borderRadius: 24, transition: 'background 0.2s',
          }} />
          <span style={{
            position: 'absolute', width: 18, height: 18, top: 3,
            left: form.show_in_directory ? 21 : 3,
            background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
          }} />
        </label>
      </div>

      {error && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        style={{ padding: '10px 28px', background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
      </button>
    </form>
  )
}
