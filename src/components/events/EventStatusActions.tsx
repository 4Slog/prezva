'use client'

import { useState } from 'react'
import { transitionEventStatus } from '@/lib/events/actions'

const NEXT_STATUS: Record<string, { label: string; status: string; style: string; confirm?: string }[]> = {
  draft:     [{ label: 'Publish',   status: 'published', style: 'bg-[#00BFA6] text-[#0D1B2A]' },
              { label: 'Cancel',    status: 'cancelled', style: 'bg-[#EF4444]/10 text-[#EF4444]',
                confirm: 'Cancel this event? Attendees will not be automatically notified.' }],
  published: [{ label: 'Go Live',  status: 'live',      style: 'bg-[#00BFA6] text-[#0D1B2A]',
                confirm: 'Mark this event as Live? This opens check-in and updates the attendee home screen.' },
              { label: 'Cancel',   status: 'cancelled', style: 'bg-[#EF4444]/10 text-[#EF4444]',
                confirm: 'Cancel this event? Attendees will not be automatically notified.' }],
  live:      [{ label: 'End Event', status: 'ended',    style: 'bg-[#1E3A5F] text-[#94A3B8]',
                confirm: 'End this event? This will trigger post-event surveys and sponsor reports.' }],
  ended:     [{ label: 'Archive',  status: 'archived',  style: 'bg-[#1E3A5F] text-[#64748B]' }],
  cancelled: [],
  archived:  [],
}

interface EventStatusActionsProps {
  eventId: string
  currentStatus: string
}

export function EventStatusActions({ eventId, currentStatus }: EventStatusActionsProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<{ status: string; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const actions = NEXT_STATUS[currentStatus] ?? []

  if (actions.length === 0) return null

  async function handle(newStatus: string) {
    setPending(newStatus)
    setError(null)
    setConfirming(null)
    const result = await transitionEventStatus(eventId, newStatus)
    setPending(null)
    if (result?.error) setError(result.error)
  }

  function handleClick(action: { label: string; status: string; confirm?: string }) {
    if (action.confirm) {
      setConfirming({ status: action.status, message: action.confirm })
    } else {
      handle(action.status)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-3 rounded-lg px-4 py-2" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
        <p className="text-sm" style={{ color: 'var(--pz-text)' }}>{confirming.message}</p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => handle(confirming.status)}
            disabled={pending !== null}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: '#EF4444', color: '#fff' }}
          >
            {pending ? 'Updating…' : 'Confirm'}
          </button>
          <button
            onClick={() => setConfirming(null)}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.status}
          onClick={() => handleClick(a)}
          disabled={pending !== null}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50 ${a.style}`}
        >
          {pending === a.status ? 'Updating…' : a.label}
        </button>
      ))}
      {error && <p className="text-sm text-[#EF4444]">{error}</p>}
    </div>
  )
}
