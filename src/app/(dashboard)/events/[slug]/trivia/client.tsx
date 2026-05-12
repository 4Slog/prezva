'use client'

import { useState, useTransition } from 'react'
import { seedTriviaQuestions } from '@/lib/engagement/sprint10-actions'
import { TRIVIA_QUESTIONS } from '@/lib/templates/trivia'

interface TriviaQuestion { id: string; question_text: string; category?: string; difficulty?: string }

interface Props {
  questions: TriviaQuestion[]
  eventId: string
  orgId: string
}

const DIFF_COLOR: Record<string, string> = { easy: '#059669', medium: '#d97706', hard: '#ef4444' }

export function TriviaAdminClient({ questions: init, eventId }: Props) {
  const [questions, setQuestions] = useState(init)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')

  function handleLoadStarter() {
    startTransition(async () => {
      const res = await seedTriviaQuestions(eventId, TRIVIA_QUESTIONS)
      if ('error' in res) { setMsg(`Error: ${res.error}`); return }
      setMsg(`Added ${res.count} trivia questions.`)
      const newItems = TRIVIA_QUESTIONS.map((q, i) => ({
        id: `tmp-${i}`,
        question_text: q.q,
        category: q.category,
        difficulty: q.difficulty,
      }))
      setQuestions(prev => [...prev, ...newItems])
    })
  }

  return (
    <div>
      {msg && <p style={{ color: '#059669', fontSize: 13, marginBottom: '1rem' }}>{msg}</p>}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem' }}>
        <button
          onClick={handleLoadStarter}
          disabled={pending}
          style={{ background: 'var(--pz-teal)', color: '#0D1B2A', border: 'none', borderRadius: 8, padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}
        >
          + Load starter pack (10 questions)
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--pz-muted)', fontSize: 14 }}>
            No trivia questions yet. Load the starter pack above.
          </div>
        )}
        {questions.map((q, i) => (
          <div key={q.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 8, padding: '0.875rem 1.25rem', background: 'var(--pz-surface)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--pz-muted)', fontSize: 12, fontWeight: 600, minWidth: 24 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <p style={{ color: 'var(--pz-text)', fontSize: 14, margin: 0 }}>{q.question_text}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {q.category && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--pz-teal)22', color: 'var(--pz-teal)', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>
                    {q.category.replace('_', ' ')}
                  </span>
                )}
                {q.difficulty && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: (DIFF_COLOR[q.difficulty] ?? '#6b7280') + '22', color: DIFF_COLOR[q.difficulty] ?? '#6b7280', padding: '2px 6px', borderRadius: 4 }}>
                    {q.difficulty}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
