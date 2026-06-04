'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  sessionId: string
  eventId: string
  isLive: boolean
}

interface SessionQuestion {
  id: string
  body: string
  upvote_count: number
  user_id: string | null
  is_anonymous: boolean
  answered_at: string | null
}

const STAT_CARDS = [
  { label: 'Viewers', sub: 'live count' },
  { label: 'Peak viewers', sub: 'this session' },
  { label: 'Avg watch %', sub: 'of duration' },
  { label: 'On track for CE', sub: 'virtual attendees ≥80%' },
]

export default function OrganizerDashboard({ sessionId, isLive }: Props) {
  const [questions, setQuestions] = useState<SessionQuestion[]>([])
  const [loadingQ, setLoadingQ] = useState(true)
  const [pushingId, setPushingId] = useState<string | null>(null)

  useEffect(() => {
    const sb = createClient()

    sb.from('session_questions')
      .select('id, body, upvote_count, user_id, is_anonymous, answered_at')
      .eq('session_id', sessionId)
      .order('upvote_count', { ascending: false })
      .then(({ data }) => {
        setQuestions((data ?? []) as SessionQuestion[])
        setLoadingQ(false)
      })

    sb.getChannels()
      .filter(ch => ch.topic === `realtime:org_questions:${sessionId}`)
      .forEach(ch => sb.removeChannel(ch))

    const channel = sb
      .channel(`org_questions:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        payload => {
          setQuestions(prev => {
            const next = [...prev, payload.new as SessionQuestion]
            return next.sort((a, b) => b.upvote_count - a.upvote_count)
          })
        },
      )
      .subscribe()

    return () => { sb.removeChannel(channel) }
  }, [sessionId])

  async function handlePushToScreen(questionId: string) {
    setPushingId(questionId)
    setTimeout(() => setPushingId(null), 1500)
  }

  return (
    <div>
      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {STAT_CARDS.map(card => (
          <div key={card.label} style={{
            background: '#112240', border: '1px solid #1E3A5F', borderRadius: 8,
            padding: '14px 16px',
          }}>
            <p style={{ fontSize: 11, color: '#64748B', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {card.label}
            </p>
            <p style={{ fontSize: 24, fontWeight: 700, color: '#F0F4F8', margin: '0 0 2px' }}>
              {isLive ? '—' : '0'}
            </p>
            <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>{card.sub}</p>
          </div>
        ))}
      </div>

      {!isLive && (
        <p style={{ fontSize: 13, color: '#64748B', marginBottom: 20, textAlign: 'center' }}>
          Live data appears when stream is active
        </p>
      )}

      {/* Drop-off chart placeholder */}
      <div style={{
        background: '#112240', border: '1px solid #1E3A5F', borderRadius: 8,
        padding: '14px 16px', marginBottom: 20,
      }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', margin: '0 0 8px' }}>Drop-off chart</p>
        <div style={{
          height: 56, borderRadius: 6, background: '#0D1B2A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ fontSize: 12, color: '#334155', margin: 0 }}>
            Drop-off chart — available when stream ends
          </p>
        </div>
      </div>

      {/* Q&A queue */}
      <div style={{ background: '#112240', border: '1px solid #1E3A5F', borderRadius: 8, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Q&amp;A queue
        </p>
        {loadingQ ? (
          <p style={{ fontSize: 13, color: '#64748B' }}>Loading…</p>
        ) : questions.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748B' }}>No questions yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {questions.map(q => (
              <div key={q.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                background: '#0D1B2A', borderRadius: 6, padding: '10px 12px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: '#F0F4F8', margin: '0 0 4px', lineHeight: 1.4 }}>{q.body}</p>
                  <p style={{ fontSize: 11, color: '#64748B', margin: 0 }}>
                    {q.upvote_count} {q.upvote_count === 1 ? 'vote' : 'votes'}
                    {q.answered_at ? ' · answered' : ''}
                  </p>
                </div>
                <button
                  onClick={() => handlePushToScreen(q.id)}
                  disabled={pushingId === q.id}
                  style={{
                    flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '4px 10px',
                    borderRadius: 5, border: '1px solid #1E3A5F',
                    background: pushingId === q.id ? '#1E3A5F' : 'transparent',
                    color: pushingId === q.id ? '#2DD4BF' : '#94A3B8',
                    cursor: pushingId === q.id ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {pushingId === q.id ? 'Pushed ✓' : 'Push to screen'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
