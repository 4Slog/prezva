'use client'

import { useState } from 'react'
import { inviteMember } from '@/lib/orgs/actions'
import { Field } from '@/components/ui/Field'

interface InviteFormProps {
  orgId: string
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
    if ('error' in result) {
      setError(result.error)
    } else {
      setSuccess(true)
      ;(e.target as HTMLFormElement).reset()
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">Invite a team member</h3>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Email address" htmlFor="invite-email" required>
            <input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="colleague@example.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </Field>
        </div>
        <div>
          <Field label="Role" htmlFor="invite-role">
            <select
              id="invite-role"
              name="role"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
          </Field>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--pz-teal)] px-4 py-2 text-sm font-medium text-[var(--pz-bg)] hover:bg-[var(--pz-teal-light)] disabled:opacity-50"
        >
          {pending ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-2 text-sm text-green-600">Invite sent!</p>}
    </div>
  )
}
