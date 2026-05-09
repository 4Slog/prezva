'use client'

import { useState } from 'react'
import { createOrg } from '@/lib/orgs/actions'

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
    // on success: createOrg redirects to /orgs/[slug]/settings
  }

  function toSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Create an organization</h1>
      <p className="mb-8 text-sm text-gray-500">
        Organizations group your events and team members together.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Organization name <span className="text-red-500">*</span>
          </label>
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder="Acme Events LLC"
            onChange={(e) => {
              const slugInput = document.getElementById('slug') as HTMLInputElement
              if (slugInput && !slugInput.dataset.touched) {
                slugInput.value = toSlug(e.target.value)
              }
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            URL slug <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <span className="select-none border-r border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-400">
              prezva.app/orgs/
            </span>
            <input
              id="slug"
              name="slug"
              required
              minLength={2}
              maxLength={40}
              pattern="[a-z0-9-]+"
              placeholder="acme-events"
              onInput={(e) => {
                ;(e.target as HTMLInputElement).dataset.touched = 'true'
              }}
              className="flex-1 rounded-r-md px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, and hyphens only</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Timezone</label>
          <select
            name="timezone"
            defaultValue="America/Chicago"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </div>
  )
}
