'use client'

import { useState } from 'react'
import { submitIcebreakerResponse, getIcebreakerResponses } from '@/lib/engagement/sprint10-actions'
import { Avatar } from '@/components/identity/Avatar'
import { HandleTag } from '@/components/identity/HandleTag'

type FeedEntry = { name: string; handle: string | null; avatarUrl: string | null; response: string }
type Props = { questions: any[]; eventId: string }

export function IcebreakersClient({ questions, eventId }: Props) {
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [submitted, setSubmitted] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<string | null>(null)
  const [responseFeed, setResponseFeed] = useState<Record<string, FeedEntry[]>>({})
  const [earnedPoints, setEarnedPoints] = useState<Record<string, number>>({})

  async function submit(questionId: string) {
    const text = responses[questionId]?.trim()
    if (!text) return
    setPending(questionId)
    const result = await submitIcebreakerResponse(eventId, questionId, text)
    if (!result?.error) {
      setSubmitted(prev => new Set(prev).add(questionId))
      setEarnedPoints(prev => ({ ...prev, [questionId]: result.points }))
      const feed = await getIcebreakerResponses(eventId, questionId)
      setResponseFeed(prev => ({ ...prev, [questionId]: feed }))
    }
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
            <div>
              <p style={{ fontSize: 13, color: 'var(--pz-success)', marginBottom: 8 }}>✓ Submitted — +{earnedPoints[q.id] ?? 0} points earned!</p>
              {responseFeed[q.id] && responseFeed[q.id].length > 0 && (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--pz-muted)', marginBottom: 6 }}>{responseFeed[q.id].length} people answered</p>
                  <div className="space-y-2">
                    {responseFeed[q.id].slice(0, 10).map((entry, i) => (
                      <div key={i} style={{ fontSize: 13, color: 'var(--pz-text)', background: 'var(--pz-surface-2)', borderRadius: 6, padding: '6px 10px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <Avatar name={entry.name} avatarUrl={entry.avatarUrl} size={40} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{entry.name}</span>
                            <HandleTag handle={entry.handle} />
                          </div>
                          <span>{entry.response}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
