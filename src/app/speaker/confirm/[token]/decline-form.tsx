'use client'

import { useState, useTransition } from 'react'
import { declineSpeakerSlot } from '@/lib/speaker/speaker-actions'

type Props = { token: string }

export function DeclineForm({ token }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [reason, setReason] = useState('')
  const [showAlt, setShowAlt] = useState(false)
  const [alternative, setAlternative] = useState('')
  const [done, setDone] = useState(false)
  const [, startTransition] = useTransition()

  if (done) {
    return (
      <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
        Your decline has been recorded. Thank you for letting us know.
      </div>
    )
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-lg px-6 py-2.5 text-sm font-semibold"
        style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
      >
        Decline
      </button>
    )
  }

  function submit() {
    startTransition(async () => {
      await declineSpeakerSlot(token, reason || undefined, alternative || undefined)
      setDone(true)
    })
  }

  return (
    <div className="space-y-3 p-4 rounded-lg" style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>Decline invitation</p>
      <div>
        <label className="text-xs font-medium block mb-1" style={{ color: 'var(--pz-muted)' }}>
          Reason for declining (optional)
        </label>
        <textarea
          rows={3}
          className="pz-input w-full text-sm"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Share why you're unable to participate…"
        />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--pz-text)' }}>
        <input
          type="checkbox"
          checked={showAlt}
          onChange={e => setShowAlt(e.target.checked)}
        />
        Would you like to suggest alternative dates?
      </label>
      {showAlt && (
        <textarea
          rows={2}
          className="pz-input w-full text-sm"
          value={alternative}
          onChange={e => setAlternative(e.target.value)}
          placeholder="e.g. I'm available Oct 15–20…"
        />
      )}
      <div className="flex gap-2">
        <button
          onClick={submit}
          className="rounded-lg px-4 py-2 text-sm font-semibold"
          style={{ background: 'var(--pz-error, #ef4444)', color: '#fff' }}
        >
          Submit decline
        </button>
        <button
          onClick={() => setShowForm(false)}
          className="text-sm"
          style={{ color: 'var(--pz-muted)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
