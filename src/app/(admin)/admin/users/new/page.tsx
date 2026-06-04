'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AdminNewPlannerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    const fd = new FormData(e.currentTarget)
    const body = {
      email: fd.get('email') as string,
      fullName: fd.get('fullName') as string,
      orgName: fd.get('orgName') as string,
      orgSlug: fd.get('orgSlug') as string,
    }

    const res = await fetch('/api/admin/users/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to onboard planner')
    } else {
      setSuccess(`Invite sent to ${body.email}. Org "${body.orgName}" created.`)
      ;(e.target as HTMLFormElement).reset()
    }
  }

  function slugify(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/admin/orgs" className="text-xs text-[var(--pz-label)] hover:text-[var(--pz-muted)]">← Organizations</Link>
        <h1 className="text-xl font-bold text-[var(--pz-text)] mt-1">Onboard New Planner</h1>
        <p className="text-sm text-[var(--pz-label)] mt-1">Creates an organization and sends a welcome email invite.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[var(--pz-label)] uppercase mb-1">Full Name</label>
          <input
            name="fullName"
            required
            placeholder="Jane Smith"
            className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--pz-label)] uppercase mb-1">Email Address</label>
          <input
            name="email"
            type="email"
            required
            placeholder="jane@example.com"
            className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--pz-label)] uppercase mb-1">Organization Name</label>
          <input
            name="orgName"
            required
            placeholder="Acme Events"
            onChange={e => {
              const slugInput = e.currentTarget.form?.elements.namedItem('orgSlug') as HTMLInputElement
              if (slugInput && !slugInput.dataset.edited) {
                slugInput.value = slugify(e.target.value)
              }
            }}
            className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] focus:outline-none focus:border-[var(--pz-teal)]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--pz-label)] uppercase mb-1">Organization Slug</label>
          <input
            name="orgSlug"
            required
            placeholder="acme-events"
            pattern="[a-z0-9\-]+"
            onInput={e => { (e.target as HTMLInputElement).dataset.edited = '1' }}
            className="w-full bg-[var(--pz-bg)] border border-[var(--pz-border)] rounded-lg px-3 py-2 text-sm text-[var(--pz-text)] font-mono focus:outline-none focus:border-[var(--pz-teal)]"
          />
          <p className="text-xs text-[var(--pz-label)] mt-1">Lowercase letters, numbers, hyphens only.</p>
        </div>

        {error && <p className="text-sm text-[var(--pz-error)] bg-[var(--pz-error-bg)] rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-[var(--pz-teal-ink)] bg-[var(--pz-teal-bg)] rounded-lg px-3 py-2">{success}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-[var(--pz-teal)] text-[var(--pz-on-accent)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Sending invite…' : 'Send Invite'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 rounded-lg bg-[var(--pz-surface-2)] text-sm text-[var(--pz-muted)] hover:bg-[var(--pz-border)]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
