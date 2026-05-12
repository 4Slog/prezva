'use client'

import { useState } from 'react'
import { transitionEventStatus } from '@/lib/events/actions'

const NEXT_STATUS: Record<string, { label: string; status: string; style: string }[]> = {
  draft:     [{ label: 'Publish',   status: 'published', style: 'bg-[#00BFA6] text-[#0D1B2A]' },
              { label: 'Cancel',    status: 'cancelled', style: 'bg-[#EF4444]/10 text-[#EF4444]' }],
  published: [{ label: 'Go Live',  status: 'live',      style: 'bg-[#00BFA6] text-[#0D1B2A]' },
              { label: 'Cancel',   status: 'cancelled', style: 'bg-[#EF4444]/10 text-[#EF4444]' }],
  live:      [{ label: 'End Event', status: 'ended',     style: 'bg-[#1E3A5F] text-[#94A3B8]' }],
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
  const [error, setError] = useState<string | null>(null)
  const actions = NEXT_STATUS[currentStatus] ?? []

  if (actions.length === 0) return null

  async function handle(newStatus: string) {
    setPending(newStatus)
    setError(null)
    const result = await transitionEventStatus(eventId, newStatus)
    setPending(null)
    if (result?.error) setError(result.error)
  }

  return (
    <div className="flex items-center gap-2">
      {actions.map((a) => (
        <button
          key={a.status}
          onClick={() => handle(a.status)}
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
