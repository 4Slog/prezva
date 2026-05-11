'use client'

import { useState } from 'react'
import { inviteMember } from '@/lib/orgs/actions'

interface InviteFormProps {
  orgId: string
}

const inputStyle = {
  background: 'var(--pz-surface-2)',
  border: '1px solid var(--pz-border)',
  color: 'var(--pz-text)',
}

export function InviteForm({ orgId }: InviteFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true)
    setError(null)
    setSuccess(false)
    const fd = new FormData(e.currentTarget)
    const result = await inviteMember(orgId, fd)
    setPending(false)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccess(true)
      ;(e.target as HTMLFormElement).reset()
    }
  }

  return (
    <div
      className="rounded-lg p-6"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <h3 className="mb-4 text-base font-semibold" style={{ color: 'var(--pz-text)' }}>
        Invite a team member
      </h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Email address
          </label>
          <input
            name="email" type="email" required placeholder="colleague@example.com"
            className="w-full rounded-md px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: 'var(--pz-muted)' }}>
            Role
          </label>
          <select
            name="role"
            className="rounded-md px-3 py-2 text-sm focus:outline-none"
            style={inputStyle}
          >
            <option value="admin">Admin</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm" style={{ color: 'var(--pz-error)' }}>{error}</p>}
      {success && <p className="mt-2 text-sm" style={{ color: 'var(--pz-success)' }}>Invite sent!</p>}
    </div>
  )
}
