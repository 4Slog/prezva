'use client'

import { useState } from 'react'
import { moderateQAQuestion } from '@/lib/speaker/speaker-actions'

type Props = {
  eventId: string
  initialQuestions: any[]
}

export function QAModerationClient({ eventId: _eventId, initialQuestions }: Props) {
  const [questions, setQuestions] = useState<any[]>(initialQuestions)
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string | null>(null)

  async function act(questionId: string, action: 'hide' | 'pin' | 'unpin' | 'answer') {
    setPending(questionId + action)
    const answerText = action === 'answer' ? answerDraft[questionId] : undefined
    await moderateQAQuestion(questionId, action, answerText)
    setQuestions(prev => prev.map(q => {
      if (q.id !== questionId) return q
      if (action === 'hide')   return { ...q, is_hidden: true }
      if (action === 'pin')    return { ...q, is_pinned: true }
      if (action === 'unpin')  return { ...q, is_pinned: false }
      if (action === 'answer') return { ...q, organizer_answer: answerText ?? '' }
      return q
    }))
    if (action === 'answer') setAnswerDraft(prev => ({ ...prev, [questionId]: '' }))
    setPending(null)
  }

  const visible = questions.filter(q => !q.is_hidden)
  const hidden  = questions.filter(q => q.is_hidden)

  if (questions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>
        No Q&A questions yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {visible.map((q: any) => (
        <div key={q.id} className="pz-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {q.is_pinned && <span style={{ fontSize: 13 }}>📌</span>}
                <p className="text-sm font-medium" style={{ color: 'var(--pz-text)', margin: 0 }}>{q.body}</p>
              </div>
              <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                {q.sessions?.title ?? 'Unknown session'} · ▲ {q.upvote_count ?? 0}
              </p>
              {q.organizer_answer && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--pz-teal-bg)',
                              borderLeft: '3px solid var(--pz-teal)', borderRadius: 4 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-teal-ink)', margin: '0 0 2px' }}>Your answer</p>
                  <p style={{ fontSize: 13, color: 'var(--pz-text)', margin: 0 }}>{q.organizer_answer}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={() => act(q.id, q.is_pinned ? 'unpin' : 'pin')}
                disabled={pending !== null}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5,
                         border: '1px solid var(--pz-border)', color: q.is_pinned ? 'var(--pz-teal)' : 'var(--pz-muted)',
                         background: 'transparent', cursor: 'pointer' }}
              >
                {q.is_pinned ? 'Unpin' : 'Pin'}
              </button>
              <button
                onClick={() => act(q.id, 'hide')}
                disabled={pending !== null}
                style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5,
                         border: '1px solid var(--pz-border)', color: 'var(--pz-muted)',
                         background: 'transparent', cursor: 'pointer' }}
              >
                Hide
              </button>
            </div>
          </div>
          {/* Inline answer */}
          <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
            <input
              className="pz-input flex-1 text-xs"
              placeholder="Type an answer…"
              value={answerDraft[q.id] ?? ''}
              onChange={e => setAnswerDraft(prev => ({ ...prev, [q.id]: e.target.value }))}
            />
            <button
              onClick={() => act(q.id, 'answer')}
              disabled={!answerDraft[q.id]?.trim() || pending !== null}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5,
                       background: 'var(--pz-teal)', color: '#fff', cursor: 'pointer',
                       border: 'none', opacity: !answerDraft[q.id]?.trim() ? 0.5 : 1 }}
            >
              Answer
            </button>
          </div>
        </div>
      ))}
      {hidden.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, color: 'var(--pz-muted)', cursor: 'pointer' }}>
            {hidden.length} hidden question{hidden.length !== 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-2">
            {hidden.map((q: any) => (
              <div key={q.id} style={{ padding: '8px 12px', borderRadius: 8,
                                       background: 'var(--pz-surface-2)', opacity: 0.6,
                                       display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: 0 }}>{q.body}</p>
                <span style={{ fontSize: 10, background: 'var(--pz-error-bg, rgba(239,68,68,0.1))',
                               color: 'var(--pz-error)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>Hidden</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
