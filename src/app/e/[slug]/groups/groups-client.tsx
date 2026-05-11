'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createGroupConversation,
  getGroupMessages,
  addGroupMessage,
} from '@/lib/networking/sprint8-group-actions'

interface Conversation { id: string; name: string; created_at: string }
interface Message { id: string; body: string; created_at: string; sender_id: string }

export function GroupsClient({
  eventSlug,
  eventId,
  userId,
  initialConversations,
}: {
  eventSlug: string
  eventId: string
  userId: string
  initialConversations: Conversation[]
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!activeId) return
    getGroupMessages(activeId).then(msgs => setMessages(msgs as Message[]))
  }, [activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!activeId) return
    const sb = supabaseRef.current
    const channel = sb
      .channel(`group:${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `conversation_id=eq.${activeId}` }, payload => {
        const msg = payload.new as Message
        setMessages(prev => [...prev, msg])
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [activeId])

  async function handleSend() {
    if (!body.trim() || !activeId) return
    setSending(true)
    await addGroupMessage(activeId, body.trim())
    setBody('')
    setSending(false)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    const result = await createGroupConversation(eventId, { name: newName.trim(), member_ids: [] })
    if (!('error' in result) && result.data) {
      const convo = { id: (result.data as any).id, name: newName.trim(), created_at: new Date().toISOString() }
      setConversations(prev => [convo, ...prev])
      setActiveId(convo.id)
    }
    setNewName('')
    setShowCreate(false)
    setCreating(false)
  }

  const inputStyle = { background: 'var(--pz-surface-2)', border: '1px solid var(--pz-border)', color: 'var(--pz-text)' }
  const activeConvo = conversations.find(c => c.id === activeId)

  return (
    <div className="flex gap-4" style={{ height: '70vh' }}>
      {/* Sidebar */}
      <div className="pz-card overflow-y-auto" style={{ width: 240, flexShrink: 0 }}>
        <div className="p-3 border-b" style={{ borderColor: 'var(--pz-border)' }}>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
          >
            + New group
          </button>
          {showCreate && (
            <div className="mt-2 space-y-2">
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Group name…"
                className="w-full rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                style={inputStyle}
              />
              <button
                onClick={handleCreate}
                disabled={creating}
                className="w-full rounded-lg px-2 py-1.5 text-xs font-semibold disabled:opacity-50"
                style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}
        </div>
        <div className="py-1">
          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-xs text-center" style={{ color: 'var(--pz-muted)' }}>No groups yet</p>
          ) : conversations.map(c => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className="w-full text-left px-3 py-2 text-sm transition-colors"
              style={{
                background: c.id === activeId ? 'var(--pz-surface-2)' : 'transparent',
                color: 'var(--pz-text)',
              }}
            >
              # {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="pz-card flex-1 flex flex-col overflow-hidden">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Select a group to start chatting</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--pz-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}># {activeConvo?.name}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <p className="text-xs text-center py-8" style={{ color: 'var(--pz-muted)' }}>No messages yet. Say hello!</p>
              ) : messages.map(m => (
                <div key={m.id} className={`flex ${m.sender_id === userId ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="rounded-xl px-3 py-2 text-sm max-w-[75%]"
                    style={{
                      background: m.sender_id === userId ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                      color: m.sender_id === userId ? '#0D1B2A' : 'var(--pz-text)',
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--pz-border)' }}>
              <div className="flex gap-2">
                <input
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder="Message the group…"
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={inputStyle}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !body.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
