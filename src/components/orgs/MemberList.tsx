'use client'

import { useState } from 'react'
import { removeMember } from '@/lib/orgs/actions'

interface Member {
  id: string
  role: string
  created_at: string
  profiles: {
    id: string
    full_name: string | null
    email: string
    avatar_url: string | null
    job_title: string | null
  } | null
}

interface MemberListProps {
  members: Member[]
  orgId: string
  currentUserId: string
  currentUserRole: string
}

export function MemberList({ members, orgId, currentUserId, currentUserRole }: MemberListProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = ['owner', 'admin'].includes(currentUserRole)

  async function handleRemove(memberId: string) {
    setRemoving(memberId)
    setError(null)
    const result = await removeMember(orgId, memberId)
    setRemoving(null)
    if (result?.error) setError(result.error)
  }

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      owner: 'bg-purple-100 text-purple-700',
      admin: 'bg-blue-100 text-blue-700',
      staff: 'bg-gray-100 text-gray-700',
    }
    return (
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[role] ?? styles.staff}`}>
        {role}
      </span>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-900">Team members ({members.length})</h3>
      </div>
      {error && <p className="px-6 py-2 text-sm text-red-600">{error}</p>}
      <ul className="divide-y divide-gray-100">
        {members.map((m) => {
          const p = m.profiles
          return (
            <li key={m.id} className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold uppercase text-gray-600">
                  {p?.full_name?.[0] ?? p?.email?.[0] ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {p?.full_name ?? p?.email}
                    {p?.id === currentUserId && (
                      <span className="ml-2 text-xs text-gray-400">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">{p?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {roleBadge(m.role)}
                {canManage && p?.id !== currentUserId && m.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(p?.id ?? '')}
                    disabled={removing === p?.id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {removing === p?.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
