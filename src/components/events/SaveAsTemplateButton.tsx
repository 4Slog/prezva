'use client'

import { useState } from 'react'
import { saveEventAsTemplate } from '@/lib/productivity/sprint11-actions'

interface Props {
  eventId: string
  defaultName: string
}

export function SaveAsTemplateButton({ eventId, defaultName }: Props) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setSaving(true)
    setError(null)
    const result = await saveEventAsTemplate(eventId, defaultName, '')
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  if (saved) {
    return (
      <span className="rounded-lg border px-4 py-2 text-sm font-medium" style={{ borderColor: 'var(--pz-teal)', color: 'var(--pz-teal-ink)' }}>
        Saved as template!
      </span>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={saving}
        className="rounded-lg border border-[var(--pz-border)] px-4 py-2 text-sm font-medium text-[var(--pz-muted)] hover:text-[var(--pz-text)] hover:border-[var(--pz-teal)]/40 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save as template'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </>
  )
}
