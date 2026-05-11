'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  postSessionMessage,
  postSessionQuestion,
  upvoteSessionQuestion,
} from '@/lib/agenda/sprint6-actions'

interface Message {
  id: string
  body: string
  created_at: string
  user_id: string
  profiles?: { full_name: string | null; avatar_url: string | null } | null
}

interface Question {
  id: string
  body: string
  upvote_count: number
  is_answered: boolean
  created_at: string
  user_id: string
  profiles?: { full_name: string | null } | null
}

export function SessionChat({
  sessionId,
  userId,
  initialMessages,
  initialQuestions,
}: {
  sessionId: string
  userId: string | null
  initialMessages: Message[]
  initialQuestions: Question[]
}) {
  const [mode, setMode] = useState<'chat' | 'qa'>('chat')
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [messageInput, setMessageInput] = useState('')
  const [questionInput, setQuestionInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_messages', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.find((m) => m.id === payload.new.id)) return prev
            return [...prev, payload.new as Message]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setQuestions((prev) => {
            if (prev.find((q) => q.id === payload.new.id)) return prev
            return [...prev, payload.new as Question].sort((a, b) => b.upvote_count - a.upvote_count)
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setQuestions((prev) =>
            prev
              .map((q) => (q.id === payload.new.id ? { ...q, ...payload.new } : q))
              .sort((a, b) => b.upvote_count - a.upvote_count),
          )
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  async function sendMessage() {
    if (!userId || !messageInput.trim()) return
    setSubmitting(true)
    const result = await postSessionMessage(sessionId, messageInput.trim())
    if (result.data) {
      setMessages((prev) => [...prev, result.data as Message])
    }
    setMessageInput('')
    setSubmitting(false)
  }

  async function sendQuestion() {
    if (!userId || !questionInput.trim()) return
    setSubmitting(true)
    const result = await postSessionQuestion(sessionId, questionInput.trim())
    if (result.data) {
      setQuestions((prev) => [...prev, result.data as Question])
    }
    setQuestionInput('')
    setSubmitting(false)
  }

  async function handleUpvote(questionId: string) {
    if (!userId) return
    await upvoteSessionQuestion(questionId)
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }

  return (
    <div className="flex flex-col" style={{ height: 480 }}>
      {/* Mode toggle */}
      <div className="flex gap-1 mb-3">
        {(['chat', 'qa'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="rounded-lg px-4 py-1.5 text-xs font-semibold"
            style={{
              background: mode === m ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
              color: mode === m ? '#0D1B2A' : 'var(--pz-muted)',
            }}
          >
            {m === 'chat' ? 'Chat' : 'Q&A'}
          </button>
        ))}
      </div>

      {mode === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {messages.length === 0 ? (
              <p className="text-xs text-center pt-8" style={{ color: 'var(--pz-muted)' }}>No messages yet. Be the first!</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.user_id === userId ? 'items-end' : 'items-start'}`}>
                  <p className="text-xs mb-0.5" style={{ color: 'var(--pz-label)' }}>
                    {msg.profiles?.full_name ?? 'Attendee'}
                  </p>
                  <div
                    className="rounded-xl px-3 py-2 text-sm max-w-[85%]"
                    style={{
                      background: msg.user_id === userId ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                      color: msg.user_id === userId ? '#0D1B2A' : 'var(--pz-text)',
                    }}
                  >
                    {msg.body}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          {userId ? (
            <div className="mt-3 flex gap-2">
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Message…"
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
              <button
                onClick={sendMessage}
                disabled={submitting || !messageInput.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                Send
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-center" style={{ color: 'var(--pz-muted)' }}>
              <a href="/login" style={{ color: 'var(--pz-teal)' }}>Sign in</a> to chat
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {questions.length === 0 ? (
              <p className="text-xs text-center pt-8" style={{ color: 'var(--pz-muted)' }}>No questions yet.</p>
            ) : (
              questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-xl p-3"
                  style={{
                    background: 'var(--pz-surface-2)',
                    border: '1px solid ' + (q.is_answered ? 'var(--pz-teal)' : 'var(--pz-border)'),
                  }}
                >
                  <p className="text-sm" style={{ color: 'var(--pz-text)' }}>{q.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>
                      {q.profiles?.full_name ?? 'Attendee'}
                      {q.is_answered && <span className="ml-2" style={{ color: 'var(--pz-teal)' }}>✓ Answered</span>}
                    </p>
                    <button
                      onClick={() => handleUpvote(q.id)}
                      disabled={!userId}
                      className="flex items-center gap-1 text-xs disabled:opacity-40 hover:opacity-70"
                      style={{ color: 'var(--pz-muted)' }}
                    >
                      ▲ {q.upvote_count}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          {userId ? (
            <div className="mt-3 flex gap-2">
              <input
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendQuestion() } }}
                placeholder="Ask a question…"
                className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={inputStyle}
              />
              <button
                onClick={sendQuestion}
                disabled={submitting || !questionInput.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
              >
                Ask
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-center" style={{ color: 'var(--pz-muted)' }}>
              <a href="/login" style={{ color: 'var(--pz-teal)' }}>Sign in</a> to ask questions
            </p>
          )}
        </>
      )}
    </div>
  )
}
