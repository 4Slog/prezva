'use client'

import { useState, useTransition } from 'react'
import { upsertUserProfile } from '@/lib/attendees/profile-actions'
import { updateHandle } from '@/lib/identity/actions'
import { Field } from '@/components/ui/Field'
import { AvatarUpload } from '@/components/upload/AvatarUpload'

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

export function ProfileClient({ email, handle, avatarUrl, initial }: { email: string; handle: string; avatarUrl: string; initial: ProfileFields }) {
  const [form, setForm] = useState<ProfileFields>(initial)
  const [interestInput, setInterestInput] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const [currentHandle, setCurrentHandle] = useState(handle)
  const [handleInput, setHandleInput] = useState(handle)
  const [handleError, setHandleError] = useState('')
  const [handleSaved, setHandleSaved] = useState(false)
  const [isHandlePending, startHandleTransition] = useTransition()

  function handleHandleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setHandleError('')
    setHandleSaved(false)
    startHandleTransition(async () => {
      const res = await updateHandle(handleInput)
      if (!res.ok) {
        setHandleError(res.error)
      } else {
        setCurrentHandle(res.handle)
        setHandleInput(res.handle)
        setHandleSaved(true)
      }
    })
  }

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

  return (
    <>
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 4 }}>Profile photo</h2>
        <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 12 }}>Your avatar across all events. You can set a different photo per event on that event&apos;s profile page.</p>
        <AvatarUpload currentUrl={avatarUrl} refreshOnUpload />
      </div>

      <form onSubmit={handleHandleSubmit}>
        <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Handle</h2>
          <div style={{ marginBottom: 12 }}>
            <Field label="Your @handle" htmlFor="profile-handle">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--pz-muted)', fontSize: 14 }}>@</span>
                <input
                  id="profile-handle"
                  value={handleInput}
                  onChange={e => { setHandleInput(e.target.value); setHandleSaved(false) }}
                  placeholder="your_handle"
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </Field>
          </div>
          {handleError && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{handleError}</p>}
          <button
            type="submit"
            disabled={isHandlePending || handleInput === currentHandle}
            style={{
              padding: '8px 20px',
              background: 'var(--pz-teal)',
              color: 'var(--pz-on-accent)',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: isHandlePending || handleInput === currentHandle ? 'not-allowed' : 'pointer',
              opacity: isHandlePending || handleInput === currentHandle ? 0.7 : 1,
            }}
          >
            {isHandlePending ? 'Saving…' : handleSaved ? 'Saved ✓' : 'Save handle'}
          </button>
        </div>
      </form>

      <form onSubmit={handleSubmit}>
      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Basic info</h2>

        <div style={{ marginBottom: 14 }}>
          <Field label="Email" htmlFor="profile-email">
            <input id="profile-email" value={email} readOnly style={{ ...inputStyle, opacity: 0.5 }} />
          </Field>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Field label="Display name" htmlFor="profile-display-name">
            <input
              id="profile-display-name"
              value={form.display_name}
              onChange={e => set('display_name', e.target.value)}
              placeholder="How you appear to other attendees"
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Field label="Pronouns" htmlFor="profile-pronouns">
            <input
              id="profile-pronouns"
              value={form.pronouns}
              onChange={e => set('pronouns', e.target.value)}
              placeholder="e.g. she/her, he/him, they/them"
              style={{ ...inputStyle, maxWidth: 240 }}
            />
          </Field>
        </div>

        <div>
          <Field label="Bio" htmlFor="profile-bio">
            <textarea
              id="profile-bio"
              value={form.bio}
              onChange={e => set('bio', e.target.value)}
              placeholder="A short bio visible on your attendee profile"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </div>
      </div>

      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Interests</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {form.interests.map(tag => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--pz-teal-bg)', color: 'var(--pz-teal-ink)', fontSize: 12, padding: '3px 10px', borderRadius: 4 }}>
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
            style={{ padding: '8px 16px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Add
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1.5rem', marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--pz-text)', marginBottom: 16 }}>Social links</h2>
        <div style={{ marginBottom: 12 }}>
          <Field label="LinkedIn URL" htmlFor="profile-linkedin-url">
            <input
              id="profile-linkedin-url"
              value={form.linkedin_url}
              onChange={e => set('linkedin_url', e.target.value)}
              placeholder="https://linkedin.com/in/..."
              type="url"
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Field label="X / Twitter URL" htmlFor="profile-twitter-url">
            <input
              id="profile-twitter-url"
              value={form.twitter_url}
              onChange={e => set('twitter_url', e.target.value)}
              placeholder="https://x.com/..."
              type="url"
              style={inputStyle}
            />
          </Field>
        </div>
        <div style={{ marginBottom: 12 }}>
          <Field label="Website" htmlFor="profile-website-url">
            <input
              id="profile-website-url"
              value={form.website_url}
              onChange={e => set('website_url', e.target.value)}
              placeholder="https://..."
              type="url"
              style={inputStyle}
            />
          </Field>
        </div>
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
            background: 'var(--pz-surface)', borderRadius: '50%', transition: 'left 0.2s',
          }} />
        </label>
      </div>

      {error && <p style={{ color: 'var(--pz-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        style={{ padding: '10px 28px', background: 'var(--pz-teal)', color: 'var(--pz-on-accent)', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}
      >
        {isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save profile'}
      </button>
      </form>
    </>
  )
}
