'use client'

import { useState, useRef, useTransition } from 'react'
import {
  saveSpeakerFormSubmission,
  createPoll,
  markQuestionAnswered,
  sendSpeakerMessage,
  getOrCreateSpeakerConversation,
  getSpeakerMessages,
  deleteHandout,
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

export function SpeakerHubClient({ token, event, speaker, sessionsWithQA: initialSessionsWithQA, formSchema, formSubmission }: Props) {
  const [tab, setTab] = useState<Tab>('sessions')
  const [sessionsWithQA, setSessionsWithQA] = useState<any[]>(initialSessionsWithQA)
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
          <p className="text-xs font-medium text-white/70 mb-0.5" style={{ fontSize: 13 }}>{event?.title}</p>
          <h1 className="text-lg font-bold text-white">Speaker Portal</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white/90" style={{ fontSize: 18 }}>{speaker?.name}</span>
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
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: '0.25rem', padding: '0 1.5rem', overflowX: 'auto' }}>
          {(['sessions', 'info', 'messages'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                if (t === 'messages' && !convId) loadMessages()
              }}
              className="text-sm font-medium capitalize"
              style={{
                borderBottom: tab === t ? '2px solid var(--pz-teal)' : '2px solid transparent',
                color: tab === t ? 'var(--pz-teal)' : 'var(--pz-muted)',
                minHeight: 44,
                padding: '0 1.25rem',
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
            {(() => {
              const eventDate = new Date((event as any).start_date)
              const isToday = eventDate.toDateString() === new Date().toDateString()
              const dayOfInfo = (event as any).speaker_day_of_info
              return isToday && dayOfInfo ? (
                <div style={{
                  background: 'var(--pz-teal)15', border: '1px solid var(--pz-teal)',
                  borderRadius: 10, padding: '1rem',
                }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-teal)', marginBottom: 6 }}>
                    Day-of Info
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--pz-text)', whiteSpace: 'pre-wrap', margin: 0 }}>
                    {dayOfInfo}
                  </p>
                </div>
              ) : null
            })()}
            {sessionsWithQA.length === 0 ? (
              <div className="pz-card p-6 text-center">
                <p className="text-sm" style={{ color: 'var(--pz-muted)' }}>No sessions assigned yet.</p>
              </div>
            ) : sessionsWithQA.map((sd: any) => (
              <div key={sd.session?.id} className="pz-card p-5">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h2 className="font-semibold" style={{ color: 'var(--pz-text)' }}>{sd.session?.title}</h2>
                  {sd.session?.session_role && sd.session.session_role !== 'presenter' && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: 'var(--pz-teal)22', color: 'var(--pz-teal)' }}>
                      {sd.session.session_role.charAt(0).toUpperCase() + sd.session.session_role.slice(1)}
                    </span>
                  )}
                </div>
                {sd.session?.starts_at && (
                  <p className="text-xs mb-4" style={{ color: 'var(--pz-muted)' }}>
                    {new Date(sd.session.starts_at).toLocaleString()}
                  </p>
                )}

                {/* Co-speakers */}
                {sd.co_speakers?.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--pz-border)', marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--pz-muted)', marginBottom: 6 }}>
                      ALSO PRESENTING
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sd.co_speakers.map((cs: any) => (
                        <div key={cs.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'var(--pz-teal)22', color: 'var(--pz-teal)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 700, flexShrink: 0,
                          }}>
                            {cs.name?.charAt(0) ?? '?'}
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--pz-text)', margin: 0 }}>
                              {cs.name}
                              {cs.session_role !== 'presenter' && (
                                <span style={{ fontSize: 11, color: 'var(--pz-muted)', marginLeft: 4 }}>
                                  ({cs.session_role})
                                </span>
                              )}
                            </p>
                            {(cs.job_title || cs.company) && (
                              <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: 0 }}>
                                {cs.job_title}{cs.company ? `, ${cs.company}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Handouts */}
                <div className="mb-4">
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>Handouts</p>
                  {(!sd.handouts || sd.handouts.length === 0) ? (
                    <p className="text-xs" style={{ color: 'var(--pz-muted)' }}>No handouts uploaded.</p>
                  ) : (
                    <ul className="space-y-1">
                      {sd.handouts.map((h: any) => (
                        <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="text-xs" style={{ color: 'var(--pz-text)' }}>📎 {h.filename}</span>
                          {h.version > 1 && (
                            <span style={{ fontSize: 10, background: 'var(--pz-teal)22', color: 'var(--pz-teal)',
                                           borderRadius: 4, padding: '1px 5px' }}>v{h.version}</span>
                          )}
                          <button
                            onClick={async () => {
                              if (!confirm('Delete this handout?')) return
                              await deleteHandout(h.id)
                              setSessionsWithQA(prev => prev.map(s =>
                                s.session?.id === sd.session?.id
                                  ? { ...s, handouts: s.handouts.filter((x: any) => x.id !== h.id) }
                                  : s
                              ))
                            }}
                            style={{ fontSize: 11, color: 'var(--pz-muted)', background: 'none',
                                     border: 'none', cursor: 'pointer', padding: '0 2px' }}
                            title="Delete handout"
                          >🗑</button>
                        </li>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              {q.is_pinned && <span style={{ fontSize: 12 }}>📌</span>}
                              <p className="text-sm" style={{ color: q.answered_at ? 'var(--pz-muted)' : 'var(--pz-text)', textDecoration: q.answered_at ? 'line-through' : 'none', margin: 0 }}>
                                {q.body}
                              </p>
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--pz-muted)' }}>▲ {q.upvote_count}</p>
                            {q.organizer_answer && (
                              <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--pz-teal)15',
                                            borderLeft: '3px solid var(--pz-teal)', borderRadius: 4 }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-teal)', margin: '0 0 2px' }}>
                                  Answer from organizer
                                </p>
                                <p style={{ fontSize: 13, color: 'var(--pz-text)', margin: 0 }}>
                                  {q.organizer_answer}
                                </p>
                              </div>
                            )}
                          </div>
                          {!q.answered_at && (
                            <button
                              onClick={() => answerQuestion(q.id)}
                              className="rounded text-xs font-medium shrink-0"
                              style={{ background: 'var(--pz-success)', color: '#fff', minWidth: 44, minHeight: 44 }}
                            >
                              Mark answered
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Session feedback (T-094) */}
                {sd.feedback && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>
                      Session feedback ({sd.feedback.count} responses)
                    </p>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 20 }}>{'★'.repeat(Math.round(sd.feedback.avg))}{'☆'.repeat(5 - Math.round(sd.feedback.avg))}</span>
                      <span className="text-sm font-semibold" style={{ color: 'var(--pz-text)' }}>{sd.feedback.avg.toFixed(1)}/5</span>
                    </div>
                    {sd.feedback.comments?.length > 0 && (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ fontSize: 12, color: 'var(--pz-teal)', cursor: 'pointer', userSelect: 'none' }}>
                          Read comments ({sd.feedback.comments.length})
                        </summary>
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {sd.feedback.comments.map((c: string, i: number) => (
                            <div key={i} style={{
                              background: 'var(--pz-surface-2)', borderRadius: 8,
                              padding: '0.75rem', fontSize: 13, color: 'var(--pz-text)',
                              fontStyle: 'italic', lineHeight: 1.5,
                            }}>
                              &ldquo;{c}&rdquo;
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )}

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
                          className="pz-input w-full"
                          style={{ fontSize: 16 }}
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
                      <div className="flex flex-col gap-2">
                        <button
                          onClick={submitPoll}
                          disabled={pollPending}
                          className="pz-btn-primary text-sm"
                          style={{ width: '100%', padding: '0.75rem' }}
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
            <a
              href={`/e/${(event as any).slug}/speakers/${(speaker as any).id}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                       color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none',
                       marginTop: 12 }}
            >
              Preview your public profile →
            </a>
          </div>
        )}

        {/* Messages tab (T-095d) */}
        {tab === 'messages' && (
          <div className="pz-card">
            <div className="p-4 border-b" style={{ borderColor: 'var(--pz-border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--pz-text)' }}>Message organizer</p>
            </div>
            <div className="p-4 space-y-2" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
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
            <div style={{ position: 'sticky', bottom: 0, background: 'var(--pz-surface)', borderTop: '1px solid var(--pz-border)', padding: '0.75rem', display: 'flex', gap: 8 }}>
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
