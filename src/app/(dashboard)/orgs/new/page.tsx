'use client'

import { useState } from 'react'
import { createOrg } from '@/lib/orgs/actions'

const inputStyle = {
  background: 'var(--pz-surface-2)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
}

export default function NewOrgPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const result = await createOrg(fd)
    setPending(false)
    if (result?.error) setError(result.error)
  }

  function toSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold" style={{ color: 'var(--pz-text)' }}>Create an organization</h1>
      <p className="mb-8 text-sm" style={{ color: 'var(--pz-muted)' }}>
        Organizations group your events and team members together.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Organization name <span style={{ color: 'var(--pz-error)' }}>*</span>
          </label>
          <input
            name="name" required minLength={2} maxLength={80}
            placeholder="Acme Events LLC"
            onChange={(e) => {
              const slugInput = document.getElementById('slug') as HTMLInputElement
              if (slugInput && !slugInput.dataset.touched) {
                slugInput.value = toSlug(e.target.value)
              }
            }}
            className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            URL slug <span style={{ color: 'var(--pz-error)' }}>*</span>
          </label>
          <div className="flex items-center rounded-md" style={{ border: '1px solid var(--pz-border)' }}>
            <span
              className="select-none px-3 py-2 text-sm"
              style={{ background: 'var(--pz-surface)', color: 'var(--pz-label)', borderRight: '1px solid var(--pz-border)' }}
            >
              prezva.app/orgs/
            </span>
            <input
              id="slug" name="slug" required minLength={2} maxLength={40}
              pattern="[a-z0-9-]+" placeholder="acme-events"
              onInput={(e) => { ;(e.target as HTMLInputElement).dataset.touched = 'true' }}
              className="flex-1 rounded-r-md px-3 py-2 text-sm focus:outline-none"
              style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text)' }}
            />
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--pz-label)' }}>Lowercase letters, numbers, and hyphens only</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>Timezone</label>
          <select
            name="timezone" defaultValue="America/Chicago"
            className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
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
          <p className="rounded-md px-3 py-2 text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--pz-error)' }}>
            {error}
          </p>
        )}

        <button
          type="submit" disabled={pending}
          className="rounded-md py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {pending ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </div>
  )
}
