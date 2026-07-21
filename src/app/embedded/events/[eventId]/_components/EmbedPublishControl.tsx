'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { embedPublishEvent } from '@/lib/embedded/event-actions'

const NEXT_LABEL: Record<string, string> = {
  draft: 'Publish',
  published: 'Go Live',
}

interface Props {
  eventId: string
  status: string
  entitled: boolean
}

export function EmbedPublishControl({ eventId, status, entitled }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const label = NEXT_LABEL[status]

  if (!label) return null

  async function handleClick() {
    setError(null)
    setPending(true)
    const result = await embedPublishEvent(eventId)
    setPending(false)
    if ('error' in result) {
      setError(result.error === 'entitlement_required' ? 'Publishing requires an active Prezva plan.' : result.error)
      return
    }
    router.refresh()
  }

  if (!entitled) {
    return (
      <span
        title="Publishing requires an active Prezva plan."
        className="flex shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold opacity-50"
        style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
      >
        {label} · requires plan
      </span>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={pending}
        className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity disabled:opacity-50"
        style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent, #fff)' }}
      >
        {pending ? 'Updating…' : label}
      </button>
      {error && <span className="text-xs" style={{ color: 'var(--pz-error, #dc2626)' }}>{error}</span>}
    </div>
  )
}
