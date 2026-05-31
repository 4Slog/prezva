'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createCommunityPost, getCommunityPosts } from '@/lib/networking/sprint8-actions'
import { Send } from 'lucide-react'

interface ChatMessage {
  id: string
  body: string
  sender_id?: string
  created_at: string
  attendee_name?: string | null
}

interface Props {
  eventId: string
  sessionId: string
  userId: string
  displayName: string
}

export default function LiveChat({ eventId, sessionId, userId, displayName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getCommunityPosts(eventId, undefined, 0, sessionId).then(posts => {
      setMessages((posts as any[]).slice(-50).map(normalise))
    })
  }, [eventId, sessionId])

  useEffect(() => {
    const sb = createClient()
    sb.getChannels()
      .filter(ch => ch.topic === `realtime:session_discussion:${sessionId}`)
      .forEach(ch => sb.removeChannel(ch))
    const channel = sb
      .channel(`session_discussion:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'community_posts', filter: `session_id=eq.${sessionId}` },
        payload => {
          setMessages(prev => {
            const next = [...prev, normalise(payload.new as any)]
            return next.slice(-50)
          })
        },
      )
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    await createCommunityPost(eventId, { post_type: 'post', body: text, session_id: sessionId })
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 24 }}>
            No messages yet — be the first to say something!
          </p>
        )}
        {messages.map(m => (
          <div key={m.id} style={{ fontSize: 13 }}>
            <span style={{ fontWeight: 600, marginRight: 6, color: m.sender_id === userId ? 'var(--color-teal)' : 'var(--color-text)' }}>
              {m.attendee_name ?? 'Attendee'}
            </span>
            <span style={{ color: 'var(--color-text)' }}>{m.body}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border)', padding: '8px 12px', display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Say something…"
          maxLength={500}
          style={{
            flex: 1,
            fontSize: 13,
            padding: '6px 10px',
            borderRadius: 6,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          style={{
            padding: '6px 10px',
            borderRadius: 6,
            border: 'none',
            background: 'var(--color-teal)',
            color: '#fff',
            cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
            opacity: input.trim() && !sending ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function normalise(raw: Record<string, unknown>): ChatMessage {
  return {
    id: raw.id as string,
    body: (raw.body as string) ?? '',
    sender_id: raw.user_id as string | undefined,
    created_at: raw.created_at as string,
    attendee_name: (raw.attendee_name as string | null) ?? null,
  }
}
