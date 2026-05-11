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

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner: { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  admin: { bg: 'rgba(0,191,166,0.15)', color: 'var(--pz-teal)' },
  staff: { bg: 'rgba(148,163,184,0.15)', color: 'var(--pz-muted)' },
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
    const c = ROLE_COLORS[role] ?? ROLE_COLORS.staff
    return (
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: c.bg, color: c.color }}
      >
        {role}
      </span>
    )
  }

  return (
    <div
      className="rounded-lg"
      style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)' }}
    >
      <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--pz-border)' }}>
        <h3 className="text-base font-semibold" style={{ color: 'var(--pz-text)' }}>
          Team members ({members.length})
        </h3>
      </div>
      {error && <p className="px-6 py-2 text-sm" style={{ color: 'var(--pz-error)' }}>{error}</p>}
      <ul>
        {members.map((m) => {
          const p = m.profiles
          return (
            <li
              key={m.id}
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--pz-border)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold uppercase"
                  style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-teal)' }}
                >
                  {p?.full_name?.[0] ?? p?.email?.[0] ?? '?'}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>
                    {p?.full_name ?? p?.email}
                    {p?.id === currentUserId && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--pz-label)' }}>(you)</span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{p?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {roleBadge(m.role)}
                {canManage && p?.id !== currentUserId && m.role !== 'owner' && (
                  <button
                    onClick={() => handleRemove(p?.id ?? '')}
                    disabled={removing === p?.id}
                    className="text-xs hover:underline disabled:opacity-50"
                    style={{ color: 'var(--pz-error)' }}
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
