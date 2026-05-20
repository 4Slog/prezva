'use client'

import { useState, useRef } from 'react'
import { updateSpeakerDayOfInfo } from '@/lib/speaker/speaker-actions'

type Props = {
  eventId: string
  initialValue: string
}

export function DayOfInfoSection({ eventId, initialValue }: Props) {
  const [value, setValue] = useState(initialValue)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(text: string) {
    setValue(text)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      await updateSpeakerDayOfInfo(eventId, text)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 800)
  }

  return (
    <div className="pz-card p-4 mt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>
          Day-of info for speakers
        </p>
        {saved && <span className="text-xs" style={{ color: 'var(--pz-success)' }}>Saved</span>}
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--pz-muted)' }}>
        Shown to speakers in their hub on the day of the event.
      </p>
      <textarea
        value={value}
        onChange={e => handleChange(e.target.value)}
        rows={4}
        placeholder="e.g. Check in at Registration Desk, green room is Room C. AV contact: Marcus 555-0123"
        className="w-full rounded-lg px-3 py-2 text-sm border"
        style={{
          background: 'var(--pz-surface)',
          borderColor: 'var(--pz-border)',
          color: 'var(--pz-text)',
          resize: 'vertical',
        }}
      />
    </div>
  )
}
