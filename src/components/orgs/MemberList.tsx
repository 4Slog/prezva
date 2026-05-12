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

const ROLE_STYLE: Record<string, { bg: string; text: string }> = {
  owner: { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
  admin: { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' },
  staff: { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' },
}

export function MemberList({ members, orgId, currentUserId, currentUserRole }: MemberListProps) {
  const [removing, setRemoving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canManage = ['owner', 'admin'].includes(currentUserRole)

  async function handleRemove(profileId: string) {
    setRemoving(profileId)
    setError(null)
    const result = await removeMember(orgId, profileId)
    setRemoving(null)
    if (result?.error) setError(result.error)
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--pz-border)' }}
    >
      <div
        className="px-5 py-4"
        style={{ borderBottom: '1px solid var(--pz-border)', background: 'var(--pz-surface)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>
          Team members ({members.length})
        </h3>
      </div>

      {error && (
        <p className="px-5 py-2 text-sm" style={{ color: '#FCA5A5', background: '#3B0000' }}>
          {error}
        </p>
      )}

      {members.length === 0 ? (
        <div className="px-5 py-6 text-sm text-center" style={{ color: 'var(--pz-text-muted)', background: 'var(--pz-surface)' }}>
          No team members found.
        </div>
      ) : (
        <ul style={{ background: 'var(--pz-surface)' }}>
          {members.map((m) => {
            const p = m.profiles
            const displayName = p?.full_name ?? p?.email ?? 'Unknown'
            const initial = displayName.trim().charAt(0).toUpperCase()
            const role = ROLE_STYLE[m.role] ?? ROLE_STYLE.staff
            return (
              <li
                key={m.id}
                className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: '1px solid var(--pz-border)' }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text)' }}
                  >
                    {initial}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>
                      {displayName}
                      {p?.id === currentUserId && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--pz-text-muted)' }}>(you)</span>
                      )}
                    </p>
                    {p?.email && (
                      <p className="text-xs" style={{ color: 'var(--pz-text-muted)' }}>{p.email}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: role.bg, color: role.text }}
                  >
                    {m.role}
                  </span>
                  {canManage && p?.id !== currentUserId && m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemove(p?.id ?? '')}
                      disabled={removing === p?.id}
                      className="text-xs hover:opacity-70 disabled:opacity-40 transition-opacity"
                      style={{ color: '#EF4444' }}
                    >
                      {removing === p?.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
