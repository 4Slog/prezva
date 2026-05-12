'use client'

import { useState, useTransition } from 'react'
import { seedIcebreakerPrompts } from '@/lib/engagement/sprint10-actions'
import { ICEBREAKER_PROMPTS } from '@/lib/templates/icebreakers'

interface IcebreakerQuestion { id: string; question_text: string }

interface Props {
  questions: IcebreakerQuestion[]
  eventId: string
  orgId: string
}

export function IcebreakersAdminClient({ questions: init, eventId }: Props) {
  const [questions, setQuestions] = useState(init)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [customText, setCustomText] = useState('')

  function handleLoadStarter() {
    startTransition(async () => {
      const res = await seedIcebreakerPrompts(eventId, ICEBREAKER_PROMPTS)
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setMsg(`Added ${res.count} starter prompts.`)
      // Optimistically add the prompts to the list
      const newItems = ICEBREAKER_PROMPTS.map((p, i) => ({ id: `tmp-${i}`, question_text: p.text }))
      setQuestions(prev => [...prev, ...newItems])
    })
  }

  function handleAddCustom() {
    if (!customText.trim()) return
    startTransition(async () => {
      const res = await seedIcebreakerPrompts(eventId, [{ text: customText.trim(), tags: [] }])
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setQuestions(prev => [...prev, { id: `tmp-custom-${Date.now()}`, question_text: customText.trim() }])
      setCustomText('')
      setMsg('Prompt added.')
    })
  }

  return (
    <div>
      {msg && <p style={{ color: '#059669', fontSize: 13, marginBottom: '1rem' }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleLoadStarter}
          disabled={pending}
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}
        >
          + Use starter pack (10 prompts)
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <input
          value={customText}
          onChange={e => setCustomText(e.target.value)}
          placeholder="Add a custom icebreaker prompt…"
          style={{ flex: 1, padding: '0.6rem 0.75rem', borderRadius: 8, border: '1px solid var(--pz-border)', background: 'var(--pz-surface)', color: 'var(--pz-text)', fontSize: 14 }}
          onKeyDown={e => e.key === 'Enter' && handleAddCustom()}
        />
        <button
          onClick={handleAddCustom}
          disabled={pending || !customText.trim()}
          style={{ background: 'var(--pz-surface)', border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.6rem 1rem', color: 'var(--pz-text)', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}
        >
          Add
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--pz-muted)', fontSize: 14 }}>
            No icebreaker prompts yet. Load the starter pack or add your own above.
          </div>
        )}
        {questions.map((q, i) => (
          <div key={q.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.875rem 1.25rem', background: 'var(--pz-surface)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--pz-muted)', fontSize: 12, fontWeight: 600, minWidth: 24 }}>{i + 1}</span>
            <p style={{ color: 'var(--pz-text)', fontSize: 14, flex: 1, margin: 0 }}>{q.question_text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
