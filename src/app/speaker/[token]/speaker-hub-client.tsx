'use client'

import { useState, useRef, useTransition } from 'react'
import {
  saveSpeakerFormSubmission,
  createPoll,
  markQuestionAnswered,
  sendSpeakerMessage,
  getOrCreateSpeakerConversation,
  getSpeakerMessages,
} from '@/lib/speaker/speaker-actions'
import { createClient } from '@/lib/supabase/client'

type Props = {
  token: string
  event: any
  speaker: any
  sessionsWithQA: any[]
  formSchema: any[]
  formSubmission: Record<string, string>
}

type Tab = 'sessions' | 'info' | 'messages'

export function SpeakerHubClient({ token, event, speaker, sessionsWithQA, formSchema, formSubmission }: Props) {
  const [tab, setTab] = useState<Tab>('sessions')
  const [formData, setFormData] = useState<Record<string, string>>(formSubmission)
  const [formSaved, setFormSaved] = useState(false)
  const [, startTransition] = useTransition()

  // Polls state
  const [pollSession, setPollSession] = useState<string>('')
  const [pollBody, setPollBody] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollPending, setPollPending] = useState(false)

  // Messages state
  const [convId, setConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [msgBody, setMsgBody] = useState('')
  const [msgPending, setMsgPending] = useState(false)
  const supabaseRef = useRef(createClient())

  const statusColor: Record<string, string> = {
    confirmed: 'var(--pz-success)',
    declined: 'var(--pz-error, #ef4444)',
    invited: 'var(--pz-warning, #f59e0b)',
  }

  async function saveForm() {
    startTransition(async () => {
      await saveSpeakerFormSubmission(event.id, speaker.id, formData)
      setFormSaved(true)
      setTimeout(() => setFormSaved(false), 2500)
    })
  }

  async function submitPoll() {
    const opts = pollOptions.filter(o => o.trim())
    if (!pollSession || !pollBody.trim() || opts.length < 2) return
    setPollPending(true)
    await createPoll(pollSession, event.id, pollBody.trim(), opts)
    setPollBody('')
    setPollOptions(['', ''])
    setPollSession('')
    setPollPending(false)
  }

  async function answerQuestion(questionId: string) {
    await markQuestionAnswered(questionId)
  }

  async function loadMessages() {
    const id = await getOrCreateSpeakerConversation(event.id, speaker.id)
    if (!id) return
    setConvId(id)
    const msgs = await getSpeakerMessages(id)
    setMessages(msgs)
    const sb = supabaseRef.current
    const channel = sb
      .channel(`speaker-conv-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'speaker_messages', filter: `conversation_id=eq.${id}` }, payload => {
        setMessages(prev => [...prev, payload.new])
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  }

  async function sendMsg() {
    if (!convId || !msgBody.trim()) return
    setMsgPending(true)
    await sendSpeakerMessage(convId, 'speaker', msgBody.trim())
    setMsgBody('')
    setMsgPending(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pz-teal)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <p className="text-xs font-medium text-white/70 mb-0.5">{event?.title}</p>
          <h1 className="text-lg font-bold text-white">Speaker Portal</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-white/90">{speaker?.name}</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: statusColor[speaker?.status ?? 'invited'] ?? 'var(--pz-warning, #f59e0b)', color: '#fff' }}
            >
              {speaker?.status ?? 'invited'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: '0.25rem', padding: '0 1.5rem' }}>
          {(['sessions', 'info', 'messages'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                if (t === 'messages' && !convId) loadMessages()
              }}
              className="px-4 py-3 text-sm font-medium capitalize"
              style={{
                borderBottom: tab === t ? '2px solid var(--pz-teal)' : '2px solid transparent',
                color: tab === t ? 'var(--pz-teal)' : 'var(--pz-muted)',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
        {/* Sessions tab */}
        {tab === 'sessions' && (
          <div className="space-y-6">
            {sessionsWithQA.length === 0 ? (
              <div className="pz-card p-6 text-center">
                <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No sessions assigned yet.</p>
              </div>
            ) : sessionsWithQA.map((sd: any) => (
              <div key={sd.session?.id} className="pz-card p-5">
                <h2 className="font-semibold mb-1" style={{ color: 'var(--pz-text)' }}>{sd.session?.title}</h2>
                {sd.session?.starts_at && (
                  <p className="text-xs mb-4" style={{ color: 'var(--pz-muted)' }}>
                    {new Date(sd.session.starts_at).toLocaleString()}
                  </p>
                )}

                {/* Handouts */}
                <div className="mb-4">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>Handouts</p>
                  {sd.handouts?.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>No handouts uploaded.</p>
                  ) : (
                    <ul className="space-y-1">
                      {sd.handouts.map((h: any) => (
                        <li key={h.id} className="text-xs" style={{ color: 'var(--pz-text)' }}>📎 {h.filename}</li>
                      ))}
                    </ul>
                  )}
                  <HandoutUpload sessionId={sd.session?.id} speakerId={speaker.id} eventId={event.id} token={token} />
                </div>

                {/* Q&A */}
                <div className="mb-4">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>
                    Q&A ({sd.questions?.length ?? 0} questions)
                  </p>
                  {sd.questions?.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>No questions yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {sd.questions.map((q: any) => (
                        <div key={q.id} className="flex items-start justify-between gap-3 p-2 rounded-lg" style={{ background: 'var(--pz-surface-2)' }}>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm" style={{ color: q.answered_at ? 'var(--pz-muted)' : 'var(--pz-text)', textDecoration: q.answered_at ? 'line-through' : 'none' }}>
                              {q.body}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>▲ {q.upvote_count}</p>
                          </div>
                          {!q.answered_at && (
                            <button
                              onClick={() => answerQuestion(q.id)}
                              className="rounded px-2 py-1 text-xs font-medium shrink-0"
                              style={{ background: 'var(--pz-success)', color: '#fff' }}
                            >
                              Mark answered
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Polls */}
                <div>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>
                    Polls ({sd.polls?.length ?? 0})
                  </p>
                  {sd.polls?.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {sd.polls.map((p: any) => (
                        <div key={p.id} className="p-2 rounded-lg" style={{ background: 'var(--pz-surface-2)' }}>
                          <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>{p.body}</p>
                          <div className="mt-1 space-y-0.5">
                            {(p.poll_options ?? []).map((opt: any, i: number) => (
                              <p key={i} className="text-xs" style={{ color: 'var(--pz-muted)' }}>• {opt.label} ({opt.votes} votes)</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Create poll form */}
                  {pollSession === sd.session?.id ? (
                    <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--pz-surface-2)' }}>
                      <input
                        className="pz-input w-full text-sm"
                        placeholder="Poll question"
                        value={pollBody}
                        onChange={e => setPollBody(e.target.value)}
                      />
                      {pollOptions.map((opt, i) => (
                        <input
                          key={i}
                          className="pz-input w-full text-sm"
                          placeholder={`Option ${i + 1}`}
                          value={opt}
                          onChange={e => { const o = [...pollOptions]; o[i] = e.target.value; setPollOptions(o) }}
                        />
                      ))}
                      {pollOptions.length < 4 && (
                        <button className="text-xs" style={{ color: 'var(--pz-teal)' }} onClick={() => setPollOptions([...pollOptions, ''])}>
                          + Add option
                        </button>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={submitPoll}
                          disabled={pollPending}
                          className="pz-btn-primary text-sm px-3 py-1.5"
                        >
                          {pollPending ? 'Creating…' : 'Create poll'}
                        </button>
                        <button onClick={() => setPollSession('')} className="text-sm" style={{ color: 'var(--pz-muted)' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPollSession(sd.session?.id)}
                      className="text-xs"
                      style={{ color: 'var(--pz-teal)' }}
                    >
                      + Create poll
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info tab (T-095c) */}
        {tab === 'info' && (
          <div className="pz-card p-5">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--pz-text)' }}>Speaker Information</h2>
            {formSchema.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>The organizer has not set up an info form yet.</p>
            ) : (
              <div className="space-y-4">
                {formSchema.map((field: any) => (
                  <div key={field.key}>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--pz-label)' }}>
                      {field.label}{field.required && ' *'}
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        className="pz-input w-full text-sm"
                        rows={3}
                        value={formData[field.key] ?? ''}
                        onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                      />
                    ) : (
                      <input
                        type={field.type ?? 'text'}
                        className="pz-input w-full text-sm"
                        value={formData[field.key] ?? ''}
                        onChange={e => setFormData({ ...formData, [field.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <button onClick={saveForm} className="pz-btn-primary text-sm px-4 py-2">
                    Save info
                  </button>
                  {formSaved && <span className="text-xs" style={{ color: 'var(--pz-success)' }}>Saved!</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Messages tab (T-095d) */}
        {tab === 'messages' && (
          <div className="pz-card flex flex-col" style={{ height: '60vh' }}>
            <div className="p-4 border-b" style={{ borderColor: 'var(--pz-border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>Message organizer</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 && (
                <p className="text-sm text-center" style={{ color: 'var(--pz-muted)' }}>No messages yet. Start the conversation!</p>
              )}
              {messages.map((m: any) => (
                <div
                  key={m.id}
                  className={`flex ${m.sender_role === 'speaker' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="rounded-2xl px-3 py-2 max-w-xs text-sm"
                    style={{
                      background: m.sender_role === 'speaker' ? 'var(--pz-teal)' : 'var(--pz-surface-2)',
                      color: m.sender_role === 'speaker' ? '#fff' : 'var(--pz-text)',
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2" style={{ borderColor: 'var(--pz-border)' }}>
              <input
                className="pz-input flex-1 text-sm"
                placeholder="Type a message…"
                value={msgBody}
                onChange={e => setMsgBody(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg() } }}
              />
              <button
                onClick={sendMsg}
                disabled={msgPending || !msgBody.trim()}
                className="pz-btn-primary text-sm px-4"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── HandoutUpload sub-component ────────────────────────────────────────────────

function HandoutUpload({ sessionId, speakerId, eventId, token }: { sessionId: string; speakerId: string; eventId: string; token: string }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { setError('File must be under 20 MB'); return }
    setUploading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('sessionId', sessionId)
    formData.append('speakerId', speakerId)
    formData.append('eventId', eventId)
    formData.append('token', token)

    const res = await fetch('/api/speaker/handouts', { method: 'POST', body: formData })
    const json = await res.json()
    if (json.error) setError(json.error)
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="mt-2">
      <label className="cursor-pointer text-xs" style={{ color: 'var(--pz-teal)' }}>
        {uploading ? 'Uploading…' : '+ Upload handout'}
        <input type="file" className="sr-only" accept=".pdf,.ppt,.pptx,.key,.doc,.docx" onChange={handleFile} disabled={uploading} />
      </label>
      {error && <p className="text-xs mt-0.5" style={{ color: 'var(--pz-error, #ef4444)' }}>{error}</p>}
    </div>
  )
}
