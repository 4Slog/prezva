'use client'

import { useState } from 'react'
import { sendSpeakerInvite } from '@/lib/speaker/speaker-actions'

type Props = {
  event: any
  speakers: any[]
}

const statusBadge: Record<string, { bg: string; label: string }> = {
  invited:   { bg: 'var(--pz-warning, #f59e0b)',  label: 'Invited' },
  confirmed: { bg: 'var(--pz-success)',            label: 'Confirmed' },
  declined:  { bg: 'var(--pz-error, #ef4444)',     label: 'Declined' },
}

export function SpeakersOrgClient({ event, speakers }: Props) {
  const [inviting, setInviting] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<Record<string, string>>({})

  async function invite(speakerId: string) {
    setInviting(speakerId)
    const appUrl = window.location.origin
    const result = await sendSpeakerInvite(event.id, speakerId, appUrl)
    setInviteResult(prev => ({
      ...prev,
      [speakerId]: (result as any).error ?? ((result as any).sent ? 'Invite sent!' : `Portal: ${(result as any).portalUrl ?? ''}`)
    }))
    setInviting(null)
  }

  if (speakers.length === 0) {
    return (
      <div className="pz-card p-6 text-center">
        <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
          No speakers yet. Add speakers from the{' '}
          <a href={`/dashboard/events/${event.slug}/agenda`} style={{ color: 'var(--pz-teal)' }}>Agenda</a>{' '}
          page.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {speakers.map(sp => {
        const badge = statusBadge[sp.status ?? 'invited'] ?? statusBadge.invited
        return (
          <div key={sp.id} className="pz-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-medium text-sm" style={{ color: 'var(--pz-text)' }}>{sp.name}</p>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: badge.bg, color: '#fff' }}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                  {sp.email ?? 'No email'}
                  {sp.job_title && ` · ${sp.job_title}`}
                  {sp.company && sp.company !== sp.job_title && `, ${sp.company}`}
                </p>
                {sp.confirmed_at && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--pz-success)' }}>
                    Confirmed {new Date(sp.confirmed_at).toLocaleDateString()}
                  </p>
                )}
                {inviteResult[sp.id] && (
                  <p className="text-xs mt-1" style={{ color: inviteResult[sp.id].startsWith('Portal:') ? 'var(--pz-muted)' : 'var(--pz-success)', wordBreak: 'break-all' }}>
                    {inviteResult[sp.id]}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => invite(sp.id)}
                  disabled={inviting === sp.id || !sp.email}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{ background: 'var(--pz-teal)', color: '#fff', opacity: !sp.email ? 0.5 : 1 }}
                >
                  {inviting === sp.id ? 'Sending…' : 'Send invite'}
                </button>
                {sp.confirmation_token && (
                  <a
                    href={`/speaker/confirm/${sp.confirmation_token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
                  >
                    Confirm link
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
