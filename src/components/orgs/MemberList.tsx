'use client'

import { useState } from 'react'
import { removeMember, revokeInvite, resendInvite } from '@/lib/orgs/actions'

function getTimestampMs() { return Date.now() }

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

interface PendingInvite {
  id: string
  email: string
  role: string
  created_at: string
  expires_at?: string
  token?: string | null
}

interface MemberListProps {
  members: Member[]
  pendingInvites?: PendingInvite[]
  orgId: string
  currentUserId: string
  currentUserRole: string
}

const ROLE_STYLE: Record<string, { bg: string; text: string }> = {
  owner:  { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
  admin:  { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  staff:  { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' },
}

export function MemberList({ members, pendingInvites = [], orgId, currentUserId, currentUserRole }: MemberListProps) {
  const [removing, setRemoving]   = useState<string | null>(null)
  const [revoking, setRevoking]   = useState<string | null>(null)
  const [resending, setResending] = useState<string | null>(null)
  const [resent, setResent]       = useState<string | null>(null)
  const [error,    setError]      = useState<string | null>(null)
  const canManage  = ['owner', 'admin'].includes(currentUserRole)
  const totalCount = members.length + pendingInvites.length

  async function handleRemove(profileId: string) {
    setRemoving(profileId); setError(null)
    const result = await removeMember(orgId, profileId)
    setRemoving(null)
    if (result?.error) setError(result.error)
  }

  async function handleRevoke(invite: PendingInvite) {
    setRevoking(invite.id); setError(null)
    // Use server action if the invite is in org_invites (has no expires_at), else API route
    if (!invite.expires_at) {
      const result = await revokeInvite(invite.id)
      setRevoking(null)
      if ('error' in result) { setError(result.error ?? 'Failed to revoke'); return }
    } else {
      const res = await fetch(`/api/orgs/${orgId}/invites/${invite.id}`, { method: 'DELETE' })
      if (!res.ok) { setError('Failed to revoke invite'); setRevoking(null); return }
    }
    window.location.reload()
  }

  async function handleResend(inviteId: string) {
    setResending(inviteId); setError(null)
    const result = await resendInvite(inviteId)
    setResending(null)
    if ('error' in result) { setError(result.error ?? 'Failed to resend'); return }
    setResent(inviteId)
    setTimeout(() => setResent(null), 3000)
  }

  const now = getTimestampMs()
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--pz-border)' }}>
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--pz-border)', background: 'var(--pz-surface)' }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>
          Team members ({totalCount})
        </h3>
        {pendingInvites.length > 0 && (
          <span className="rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--pz-warning-fill)' }}>
            {pendingInvites.length} pending invite{pendingInvites.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {error && <p className="px-5 py-2 text-sm" style={{ color: '#FCA5A5', background: '#3B0000' }}>{error}</p>}

      {totalCount === 0 ? (
        <div className="px-5 py-6 text-sm text-center" style={{ color: 'var(--pz-muted)', background: 'var(--pz-surface)' }}>
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
              <li key={m.id} className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: '1px solid var(--pz-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-text)' }}>{initial}</div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>
                      {displayName}
                      {p?.id === currentUserId && <span className="ml-2 text-xs" style={{ color: 'var(--pz-muted)' }}>(you)</span>}
                    </p>
                    {p?.email && <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{p.email}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: role.bg, color: role.text }}>{m.role}</span>
                  {canManage && p?.id !== currentUserId && m.role !== 'owner' && (
                    <button onClick={() => handleRemove(p?.id ?? '')} disabled={removing === p?.id}
                      className="text-xs hover:opacity-70 disabled:opacity-40 transition-opacity" style={{ color: 'var(--pz-error)' }}>
                      {removing === p?.id ? 'Removing…' : 'Remove'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}

          {pendingInvites.map((invite) => {
            const role = ROLE_STYLE[invite.role] ?? ROLE_STYLE.staff
            const daysLeft = invite.expires_at
              ? Math.ceil((new Date(invite.expires_at).getTime() - now) / 86400000)
              : null
            const daysSince = Math.floor((now - new Date(invite.created_at).getTime()) / 86400000)
            return (
              <li key={invite.id} className="flex items-center justify-between px-5 py-4"
                style={{ borderTop: '1px solid var(--pz-border)', opacity: 0.85 }}>
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                    style={{ border: '2px dashed var(--pz-border)', color: 'var(--pz-muted)', background: 'transparent' }}>
                    {invite.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{invite.email}</p>
                    <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                      {daysLeft !== null
                        ? `Invite expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
                        : `Sent ${daysSince === 0 ? 'today' : `${daysSince} day${daysSince !== 1 ? 's' : ''} ago`}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: role.bg, color: role.text }}>{invite.role}</span>
                  <span className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--pz-warning-fill)' }}>Pending</span>
                  {canManage && invite.token && (
                    <button onClick={() => handleResend(invite.id)} disabled={resending === invite.id || resent === invite.id}
                      className="text-xs hover:opacity-70 disabled:opacity-40 transition-opacity" style={{ color: '#2DD4BF' }}>
                      {resending === invite.id ? 'Sending…' : resent === invite.id ? 'Sent!' : 'Resend'}
                    </button>
                  )}
                  {canManage && (
                    <button onClick={() => handleRevoke(invite)} disabled={revoking === invite.id}
                      className="text-xs hover:opacity-70 disabled:opacity-40 transition-opacity" style={{ color: 'var(--pz-error)' }}>
                      {revoking === invite.id ? 'Revoking…' : 'Revoke'}
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
