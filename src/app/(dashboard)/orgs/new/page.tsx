'use client'

import { useState } from 'react'
import { createOrg } from '@/lib/orgs/actions'

export default function NewOrgPage() {
  const [error, setError] = useState<string | null>(null)
  const [slugError, setSlugError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

  function toSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const name = e.target.value
    setOrgName(name)
    if (!slugTouched) {
      setSlug(toSlug(name))
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlug(e.target.value)
    setSlugTouched(true)
    setSlugError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setSlugError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createOrg(fd)
    setPending(false)
    if (result?.error) {
      if ((result as any).field === 'slug') {
        setSlugError(result.error)
      } else {
        setError(result.error)
      }
    }
    // on success: createOrg redirects to /orgs/[slug]/settings
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>
        Create an organization
      </h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--pz-muted)' }}>
        Organizations group your events and team members together.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-text)' }}>
            Organization name <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder="Acme Events LLC"
            value={orgName}
            onChange={handleNameChange}
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)', color: 'var(--pz-text)' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#00BFA6')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--pz-border)')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-text)' }}>
            URL slug <span className="text-red-500">*</span>
          </label>
          <div
            className="flex items-center rounded-md border"
            style={{ borderColor: slugError ? '#ef4444' : 'var(--pz-border)' }}
          >
            <span
              className="select-none border-r px-3 py-2 text-sm"
              style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-bg)', color: 'var(--pz-muted)' }}
            >
              prezva.app/orgs/
            </span>
            <input
              name="slug"
              required
              minLength={2}
              maxLength={40}
              pattern="[a-z0-9-]+"
              placeholder="acme-events"
              value={slug}
              onChange={handleSlugChange}
              className="flex-1 rounded-r-md px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--pz-surface)', color: 'var(--pz-text)' }}
            />
          </div>
          {slugError ? (
            <p className="mt-1 text-xs text-red-500">{slugError}</p>
          ) : (
            <p className="mt-1 text-xs" style={{ color: 'var(--pz-muted)' }}>
              Lowercase letters, numbers, and hyphens only
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-text)' }}>
            Timezone
          </label>
          <select
            name="timezone"
            defaultValue="America/Chicago"
            className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none"
            style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)', color: 'var(--pz-text)' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#00BFA6')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--pz-border)')}
          >
            <option value="America/New_York">Eastern (ET)</option>
            <option value="America/Chicago">Central (CT)</option>
            <option value="America/Denver">Mountain (MT)</option>
            <option value="America/Los_Angeles">Pacific (PT)</option>
            <option value="America/Anchorage">Alaska (AKT)</option>
            <option value="Pacific/Honolulu">Hawaii (HT)</option>
            <option value="UTC">UTC</option>
          </select>
        </div>

        {error && (
          <p className="rounded-md px-3 py-2 text-sm text-red-400" style={{ background: '#ef444420' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {pending ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </div>
  )
}
