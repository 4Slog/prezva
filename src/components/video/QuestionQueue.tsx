'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ThumbsUp, Check } from 'lucide-react'

interface Question {
  id: string
  body: string
  upvote_count: number
  is_anonymous: boolean
  answered_at: string | null
  user_id: string | null
}

interface Props {
  sessionId: string
  eventId: string
  isOrganizer: boolean
  userId: string
}

function sortQuestions(qs: Question[]): Question[] {
  return [...qs].sort((a, b) => {
    const aAnswered = !!a.answered_at
    const bAnswered = !!b.answered_at
    if (aAnswered !== bAnswered) return aAnswered ? 1 : -1
    return b.upvote_count - a.upvote_count
  })
}

export default function QuestionQueue({ sessionId, eventId, isOrganizer, userId }: Props) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const sb = createClient()

    sb.from('session_questions')
      .select('id, body, upvote_count, is_anonymous, answered_at, user_id')
      .eq('session_id', sessionId)
      .eq('is_poll', false)
      .order('upvote_count', { ascending: false })
      .then(({ data }) => {
        setQuestions(sortQuestions((data ?? []) as Question[]))
        setLoading(false)
      })

    sb.getChannels()
      .filter(ch => ch.topic === `realtime:qq:${sessionId}`)
      .forEach(ch => sb.removeChannel(ch))

    const channel = sb
      .channel(`qq:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        payload => {
          setQuestions(prev => sortQuestions([...prev, payload.new as Question]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        payload => {
          setQuestions(prev =>
            sortQuestions(prev.map(q => q.id === (payload.new as Question).id ? (payload.new as Question) : q)),
          )
        },
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [sessionId])

  async function handleSubmit() {
    const text = input.trim()
    if (!text || submitting) return
    setSubmitting(true)
    setInput('')
    const sb = createClient()
    await sb.from('session_questions').insert({
      session_id: sessionId,
      event_id: eventId,
      user_id: userId,
      body: text,
      is_anonymous: isAnonymous,
      is_poll: false,
      upvote_count: 0,
    } as any)
    setSubmitting(false)
  }

  async function handleUpvote(q: Question) {
    const sb = createClient()
    await sb.from('session_questions')
      .update({ upvote_count: q.upvote_count + 1 } as any)
      .eq('id', q.id)
  }

  async function handleMarkAnswered(q: Question) {
    const sb = createClient()
    await sb.from('session_questions')
      .update({ answered_at: new Date().toISOString() } as any)
      .eq('id', q.id)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 13, color: 'var(--color-text-muted)' }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {questions.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 24 }}>
            No questions yet — be the first to ask one!
          </p>
        )}
        {questions.map(q => (
          <div key={q.id} style={{
            padding: '8px 10px', borderRadius: 6,
            background: q.answered_at ? 'rgba(100,116,139,0.06)' : 'rgba(255,255,255,0.03)',
            border: '1px solid var(--color-border)',
            opacity: q.answered_at ? 0.65 : 1,
          }}>
            <p style={{
              fontSize: 13, color: 'var(--color-text)', margin: '0 0 6px', lineHeight: 1.4,
              textDecoration: q.answered_at ? 'line-through' : 'none',
            }}>
              {q.body}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!isOrganizer && (
                <button
                  onClick={() => handleUpvote(q)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                    color: 'var(--color-text-muted)', background: 'none',
                    border: '1px solid var(--color-border)', borderRadius: 4,
                    padding: '2px 8px', cursor: 'pointer',
                  }}
                >
                  <ThumbsUp size={11} /> {q.upvote_count}
                </button>
              )}
              {isOrganizer && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>▲ {q.upvote_count}</span>
                  {!q.answered_at && (
                    <button
                      onClick={() => handleMarkAnswered(q)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        fontSize: 11, padding: '2px 8px', borderRadius: 4,
                        border: '1px solid #22C55E', background: 'transparent',
                        color: '#22C55E', cursor: 'pointer',
                      }}
                    >
                      <Check size={11} /> Mark answered
                    </button>
                  )}
                  <button
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 4,
                      border: '1px solid var(--color-border)', background: 'transparent',
                      color: 'var(--color-text-muted)', cursor: 'pointer',
                    }}
                  >
                    Push to screen
                  </button>
                </>
              )}
              {q.answered_at && (
                <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 600 }}>✓ Answered</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isOrganizer && (
        <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask a question…"
            maxLength={500}
            rows={2}
            style={{
              width: '100%', fontSize: 13, padding: '6px 10px', borderRadius: 6,
              border: '1px solid var(--color-border)', background: 'var(--color-bg)',
              color: 'var(--color-text)', outline: 'none', resize: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={e => setIsAnonymous(e.target.checked)}
                style={{ accentColor: 'var(--color-teal)' }}
              />
              Anonymous
            </label>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || submitting}
              style={{
                fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 6,
                border: 'none', background: 'var(--color-teal)', color: '#0D1B2A',
                cursor: input.trim() && !submitting ? 'pointer' : 'not-allowed',
                opacity: input.trim() && !submitting ? 1 : 0.5,
              }}
            >
              {submitting ? 'Asking…' : 'Ask a question'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
