'use client'

import { useState } from 'react'
import { submitIcebreakerResponse } from '@/lib/engagement/sprint10-actions'

type Props = { questions: any[]; eventId: string }

export function IcebreakersClient({ questions, eventId }: Props) {
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)

  async function submit(questionId: string) {
    const text = responses[questionId]?.trim()
    if (!text) return
    setPending(questionId)
    const result = await submitIcebreakerResponse(eventId, questionId, text)
    if (!result?.error) setSubmitted(prev => new Set(prev).add(questionId))
    setPending(null)
  }

  if (questions.length === 0) {
    return (
      <div className="pz-card p-8 text-center">
        <p style={{ color: 'var(--pz-muted)', fontSize: 14 }}>No icebreaker questions yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {questions.map((q: any) => (
        <div key={q.id} className="pz-card p-4">
          <p style={{ fontWeight: 600, color: 'var(--pz-text)', marginBottom: 12 }}>{q.question || q.question_text || q.prompt || ''}</p>
          {submitted.has(q.id) ? (
            <p style={{ fontSize: 13, color: 'var(--pz-success)' }}>✓ Submitted — +5 points earned!</p>
          ) : (
            <div className="flex gap-2">
              <input
                className="pz-input flex-1 text-sm"
                placeholder="Your answer…"
                value={responses[q.id] ?? ''}
                onChange={e => setResponses(prev => ({ ...prev, [q.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') submit(q.id) }}
              />
              <button
                onClick={() => submit(q.id)}
                disabled={pending === q.id || !responses[q.id]?.trim()}
                className="pz-btn-primary text-sm px-4"
              >
                {pending === q.id ? '…' : 'Submit'}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
