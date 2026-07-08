'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import { MessageCircle, Search, User } from 'lucide-react'
import { getOrCreateConversation, getMessages, sendMessage } from '@/lib/messaging/actions'
import { createClient } from '@/lib/supabase/client'

interface Attendee {
  user_id: string | null
  attendee_name: string
  attendee_email: string
  interests?: string[]
  profiles?: { id: string; full_name: string | null; avatar_url: string | null; job_title: string | null; company: string | null; bio: string | null } | null
}
interface Message { id: string; conversation_id: string; sender_id: string; body: string; created_at: string }

const PAGE_SIZE = 25

export default function NetworkingClient({ attendees, eventId, currentUserId }: {
  attendees: Attendee[]; eventId: string; currentUserId: string
}) {
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [activeAttendee, setActiveAttendee] = useState<Attendee | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMsg, setNewMsg] = useState('')
  const [isPending, startTransition] = useTransition()
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!activeConvId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`messages:${activeConvId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConvId}`,
      }, (payload) => {
        const msg = payload.new as Message
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [activeConvId])

  const filtered = attendees.filter(a => {
    const name = a.profiles?.full_name ?? a.attendee_name
    return name.toLowerCase().includes(search.toLowerCase()) ||
      (a.profiles?.company ?? '').toLowerCase().includes(search.toLowerCase())
  })
  const shown = filtered.slice(0, visibleCount)

  function openChat(attendee: Attendee) {
    if (!attendee.user_id) return
    setActiveAttendee(attendee)
    startTransition(async () => {
      const res = await getOrCreateConversation(eventId, attendee.user_id!)
      if ('data' in res && res.data) {
        setActiveConvId(res.data.id)
        const msgs = await getMessages(res.data.id)
        setMessages(msgs as Message[])
      }
    })
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!activeConvId || !newMsg.trim()) return
    const body = newMsg.trim()
    setNewMsg('')
    startTransition(async () => {
      const res = await sendMessage(activeConvId, body)
      if ('data' in res && res.data) {
        setMessages(prev => [...prev, res.data as Message])
      }
    })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: activeAttendee ? '1fr 1fr' : '1fr', gap: 20 }}>
      {/* Directory */}
      <div>
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }} placeholder="Search attendees..." style={{ width: '100%', padding: '0.6rem 0.75rem 0.6rem 2rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        {filtered.length === 0 && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>No attendees found.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shown.map((a, i) => {
            const name = a.profiles?.full_name ?? a.attendee_name
            const initial = name.charAt(0).toUpperCase()
            return (
              <div key={a.user_id ?? i} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.875rem 1rem', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 12, cursor: a.user_id ? 'pointer' : 'default' }} onClick={() => a.user_id && openChat(a)}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'var(--color-teal)', fontWeight: 700, flexShrink: 0, overflow: 'hidden' }}>
                  {a.profiles?.avatar_url ? <img src={a.profiles.avatar_url} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{name}</p>
                  {a.profiles?.job_title && <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{a.profiles.job_title}{a.profiles.company ? ' · ' + a.profiles.company : ''}</p>}
                  {(a.interests ?? []).length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {(a.interests ?? []).slice(0, 3).map((interest: string) => (
                        <span key={interest} style={{ fontSize: 10, background: 'rgba(0,191,166,0.12)', color: 'var(--color-teal)', borderRadius: 4, padding: '1px 6px' }}>{interest}</span>
                      ))}
                    </div>
                  )}
                </div>
                {a.user_id && <MessageCircle size={16} style={{ color: 'var(--color-teal)', flexShrink: 0 }} />}
              </div>
            )
          })}
        </div>
        {visibleCount < filtered.length && (
          <button
            onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
            style={{ width: '100%', marginTop: 12, padding: '0.65rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Load more ({filtered.length - visibleCount} more)
          </button>
        )}
      </div>

      {/* Chat pane */}
      {activeAttendee && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', height: 500, background: 'var(--color-surface)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={20} style={{ color: 'var(--color-teal)' }} />
            <span style={{ fontWeight: 600 }}>{activeAttendee.profiles?.full_name ?? activeAttendee.attendee_name}</span>
            <button onClick={() => { setActiveAttendee(null); setActiveConvId(null); setMessages([]) }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 18 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.length === 0 && <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '2rem', fontSize: 14 }}>Start the conversation!</p>}
            {messages.map(m => {
              const isMe = m.sender_id === currentUserId
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '75%', padding: '0.5rem 0.875rem', borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: isMe ? 'var(--color-teal)' : 'var(--color-bg)', color: isMe ? '#fff' : 'var(--color-text)', fontSize: 14, border: isMe ? 'none' : '1px solid var(--color-border)' }}>
                    {m.body}
                  </div>
                </div>
              )
            })}
          </div>
          <form onSubmit={handleSend} style={{ padding: '0.75rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: 8 }}>
            <input value={newMsg} onChange={e => setNewMsg(e.target.value)} placeholder="Type a message..." style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 14 }} />
            <button type="submit" disabled={isPending || !newMsg.trim()} style={{ background: 'var(--color-teal)', color: 'var(--pz-surface)', border: 'none', borderRadius: 8, padding: '0.5rem 1rem', fontWeight: 600, cursor: 'pointer', opacity: isPending ? 0.6 : 1 }}>Send</button>
          </form>
        </div>
      )}
    </div>
  )
}
