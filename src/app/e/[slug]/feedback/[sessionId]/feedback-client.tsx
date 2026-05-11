'use client'

import { useState } from 'react'
import { submitSessionFeedback } from '@/lib/engagement/sprint10-actions'

type Props = { sessionId: string; eventId: string; eventSlug: string }

export function FeedbackClient({ sessionId, eventId, eventSlug }: Props) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (rating === 0) return
    setPending(true)
    await submitSessionFeedback(sessionId, eventId, rating, comment)
    setDone(true)
    setPending(false)
  }

  if (done) {
    return (
      <div className="text-center">
        <p style={{ fontSize: 32, marginBottom: 8 }}>🙏</p>
        <p style={{ fontWeight: 600, color: 'var(--pz-text)', marginBottom: 4 }}>Thanks for your feedback!</p>
        <a href={`/e/${eventSlug}/agenda`} style={{ fontSize: 13, color: 'var(--pz-teal)', textDecoration: 'none' }}>Back to agenda →</a>
      </div>
    )
  }

  return (
    <div>
      {/* Star rating */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            onClick={() => setRating(star)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 32,
              color: star <= rating ? '#f59e0b' : 'var(--pz-surface-2)',
              transition: 'color 0.1s',
            }}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        className="pz-input w-full text-sm"
        rows={4}
        placeholder="Any comments? (optional)"
        value={comment}
        onChange={e => setComment(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      <button
        onClick={submit}
        disabled={pending || rating === 0}
        className="pz-btn-primary w-full text-sm py-3"
      >
        {pending ? 'Submitting…' : 'Submit feedback'}
      </button>
    </div>
  )
}
