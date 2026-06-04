'use client'

import { useState, useRef, useEffect } from 'react'
import {
  getOrCreateSpeakerConversation,
  getSpeakerMessages,
  sendSpeakerMessage,
  getSpeakersWithMissingInfo,
} from '@/lib/speaker/speaker-actions'
import { createClient } from '@/lib/supabase/client'
import { Field } from '@/components/ui/Field'

type Props = {
  event: any
  conversations: any[]
  speakers: any[]
  eventSlug: string
}

export function SpeakerMessagesClient({ event, conversations: initialConvs, speakers, eventSlug }: Props) {
  const [conversations, setConversations] = useState(initialConvs)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [activeSpeaker, setActiveSpeaker] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgBody, setMsgBody] = useState('')
  const [msgPending, setMsgPending] = useState(false)

  // Bulk message
  const [bulkFilter, setBulkFilter] = useState('all')
  const [bulkBody, setBulkBody] = useState('')
  const [bulkPending, setBulkPending] = useState(false)
  const [bulkDone, setBulkDone] = useState(false)

  const [showBulk, setShowBulk] = useState(false)
  const supabaseRef = useRef(createClient())

  async function openConversation(speaker: any) {
    const id = await getOrCreateSpeakerConversation(event.id, speaker.id)
    if (!id) return
    setActiveSpeaker(speaker)
    setActiveConvId(id)
    const msgs = await getSpeakerMessages(id)
    setMessages(msgs)
  }

  useEffect(() => {
    if (!activeConvId) return
    const sb = supabaseRef.current
    const channel = sb
      .channel(`org-conv-${activeConvId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'speaker_messages', filter: `conversation_id=eq.${activeConvId}` }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }, [activeConvId])

  async function sendMsg() {
    if (!activeConvId || !msgBody.trim()) return
    setMsgPending(true)
    await sendSpeakerMessage(activeConvId, 'organizer', msgBody.trim())
    setMsgBody('')
    setMsgPending(false)
  }

  async function sendBulk() {
    if (!bulkBody.trim()) return
    setBulkPending(true)
    const targets = bulkFilter === 'all'
      ? speakers
      : await getSpeakersWithMissingInfo(event.id, bulkFilter)

    for (const sp of targets) {
      const convId = await getOrCreateSpeakerConversation(event.id, sp.id)
      if (convId) await sendSpeakerMessage(convId, 'organizer', bulkBody.trim())
    }

    setBulkDone(true)
    setBulkBody('')
    setBulkFilter('all')
    setBulkPending(false)
    setTimeout(() => setBulkDone(false), 3000)
  }

  return (
    <div className="flex h-screen" style={{ background: 'var(--pz-bg)' }}>
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r flex flex-col" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
        <div className="p-4 border-b" style={{ borderColor: 'var(--pz-border)' }}>
          <a href={`/events/${eventSlug}/speakers`} className="text-xs" style={{ color: 'var(--pz-teal)' }}>
            ← Speakers
          </a>
          <h2 className="text-sm font-semibold mt-1" style={{ color: 'var(--pz-text)' }}>Speaker Messages</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {speakers.map(sp => (
            <button
              key={sp.id}
              onClick={() => openConversation(sp)}
              className="w-full text-left px-4 py-3 hover:bg-[var(--pz-surface-2)]"
              style={{
                background: activeSpeaker?.id === sp.id ? 'var(--pz-surface-2)' : undefined,
                borderLeft: activeSpeaker?.id === sp.id ? '3px solid var(--pz-teal)' : '3px solid transparent',
              }}
            >
              <p className="text-sm font-medium truncate" style={{ color: 'var(--pz-text)' }}>{sp.name}</p>
              <p className="text-xs truncate" style={{ color: 'var(--pz-muted)' }}>{sp.email}</p>
            </button>
          ))}
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'var(--pz-border)' }}>
          <button
            onClick={() => setShowBulk(v => !v)}
            className="w-full rounded-lg py-2 text-xs font-semibold"
            style={{ background: 'var(--pz-teal)', color: '#fff' }}
          >
            Bulk message
          </button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {showBulk ? (
          <div className="p-6">
            <h3 className="font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Send bulk message</h3>
            <div className="max-w-lg space-y-4">
              <Field label="Send to" htmlFor="bulk-send-to">
                <select
                  id="bulk-send-to"
                  className="pz-input w-full text-sm"
                  value={bulkFilter}
                  onChange={e => setBulkFilter(e.target.value)}
                >
                  <option value="all">All speakers</option>
                  <option value="bio">Speakers missing bio</option>
                  <option value="photo">Speakers missing headshot</option>
                  <option value="form">Speakers missing form submission</option>
                </select>
              </Field>
              <Field label="Message" htmlFor="bulk-message">
                <textarea
                  id="bulk-message"
                  className="pz-input w-full text-sm"
                  rows={4}
                  value={bulkBody}
                  onChange={e => setBulkBody(e.target.value)}
                  placeholder="Type your message to speakers…"
                />
              </Field>
              <div className="flex items-center gap-3">
                <button
                  onClick={sendBulk}
                  disabled={bulkPending || !bulkBody.trim()}
                  className="pz-btn-primary text-sm px-5 py-2"
                >
                  {bulkPending ? 'Sending…' : 'Send to all'}
                </button>
                <button onClick={() => setShowBulk(false)} className="text-sm" style={{ color: 'var(--pz-muted)' }}>Cancel</button>
                {bulkDone && <span className="text-xs" style={{ color: 'var(--pz-success)' }}>Sent!</span>}
              </div>
            </div>
          </div>
        ) : activeConvId ? (
          <>
            <div className="p-4 border-b" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{activeSpeaker?.name}</p>
              <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>{activeSpeaker?.email}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map((m: any) => (
                <div key={m.id} className={`flex ${m.sender_role === 'organizer' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="rounded-2xl px-3 py-2 max-w-sm text-sm"
                    style={{
                      background: m.sender_role === 'organizer' ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                      color: m.sender_role === 'organizer' ? '#fff' : 'var(--pz-text)',
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2" style={{ borderColor: 'var(--pz-border)', background: 'var(--pz-surface)' }}>
              <input
                className="pz-input flex-1 text-sm"
                placeholder="Type a message…"
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
              />
              <button onClick={sendMsg} disabled={msgPending || !msgBody.trim()} className="pz-btn-primary text-sm px-4">Send</button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>Select a speaker to start messaging</p>
          </div>
        )}
      </div>
    </div>
  )
}
