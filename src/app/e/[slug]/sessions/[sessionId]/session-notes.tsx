'use client'

import { useState, useEffect } from 'react'
import { getSessionNote, saveSessionNote } from '@/lib/agenda/sprint6-actions'

export function SessionNotes({ sessionId }: { sessionId: string }) {
  const [body, setBody] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getSessionNote(sessionId).then((data) => {
      if (data) setBody(data.body)
      setLoaded(true)
    })
  }, [sessionId])

  async function handleSave() {
    setSaving(true)
    await saveSessionNote(sessionId, body)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!loaded) return <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>Loading…</p>

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="Your private notes for this session…"
        className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
        style={{ background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }}
      />
      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save notes'}
      </button>
    </div>
  )
}
