'use client'

import { useState } from 'react'
import { updateLeaderboardPointConfig } from '@/lib/engagement/sprint10-actions'

const ACTION_LABELS: Record<string, string> = {
  checkin:          'Check-in',
  session_attend:   'Session attend',
  survey_complete:  'Survey complete',
  icebreaker:       'Icebreaker response',
  profile_complete: 'Profile complete',
  community_post:   'Community post',
}

interface PointConfigEditorProps {
  eventId: string
  initialConfig: Record<string, number>
  saveAction?: (eventId: string, config: Record<string, number>) => Promise<{ ok?: boolean; error?: string }>
}

export function PointConfigEditor({ eventId, initialConfig, saveAction = updateLeaderboardPointConfig }: PointConfigEditorProps) {
  const [config, setConfig] = useState<Record<string, number>>(initialConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleChange(action: string, value: string) {
    const num = parseInt(value, 10)
    setConfig((prev) => ({ ...prev, [action]: isNaN(num) ? 0 : num }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await saveAction(eventId, config)
    setSaving(false)
    if ('error' in result) {
      setError(result.error ?? 'Failed to save')
    } else {
      setSaved(true)
    }
  }

  return (
    <div className="pz-card p-5 mt-8">
      <h2 className="text-sm font-semibold text-[var(--pz-text)] mb-4">Point values</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px 16px', alignItems: 'center' }}>
        {Object.keys(ACTION_LABELS).map((action) => (
          <>
            <label
              key={`label-${action}`}
              htmlFor={`pts-${action}`}
              style={{ fontSize: 13, color: 'var(--pz-text)' }}
            >
              {ACTION_LABELS[action]}
            </label>
            <input
              key={`input-${action}`}
              id={`pts-${action}`}
              type="number"
              min={0}
              value={config[action] ?? 0}
              onChange={(e) => handleChange(action, e.target.value)}
              style={{
                width: 72,
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid var(--pz-border)',
                background: 'var(--pz-bg)',
                color: 'var(--pz-text)',
                fontSize: 13,
                textAlign: 'right',
              }}
            />
          </>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50 transition-opacity"
          style={{ background: 'var(--pz-teal)', color: 'var(--pz-on-accent)' }}
        >
          {saving ? 'Saving…' : 'Save point values'}
        </button>
        {saved && <span style={{ fontSize: 12, color: 'var(--pz-success-fill)' }}>Saved</span>}
        {error && <span style={{ fontSize: 12, color: 'var(--pz-error)' }}>{error}</span>}
      </div>
    </div>
  )
}
