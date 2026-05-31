'use client'
import { useState, useEffect } from 'react'
import { updateRosItemStatus } from '@/lib/events/run-of-show-actions'
import { createClient } from '@/lib/supabase/client'

interface Props {
  event: any
  rosItems: any[]
  sessions: any[]
  qaQuestions: any[]
  token: string
}

type Tab = 'runofshow' | 'speakers' | 'qa'

export function MCHubClient({ event, rosItems: initRos, sessions, qaQuestions: initQA, token: _token }: Props) {
  const [tab, setTab] = useState<Tab>('runofshow')
  const [rosItems, setRosItems] = useState(initRos)
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [qaQuestions, setQaQuestions] = useState(initQA)

  const sessionIds = sessions.map((s: any) => s.id)

  useEffect(() => {
    if (sessionIds.length === 0) return
    const sb = createClient()

    sessionIds.forEach(sid => {
      sb.getChannels()
        .filter(ch => ch.topic === `realtime:mc_qa:${sid}`)
        .forEach(ch => sb.removeChannel(ch))
    })

    const channels = sessionIds.map(sid =>
      sb
        .channel(`mc_qa:${sid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sid}` },
          payload => {
            setQaQuestions(prev => [payload.new as any, ...prev])
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'session_questions', filter: `session_id=eq.${sid}` },
          payload => {
            setQaQuestions(prev =>
              prev.map((q: any) => q.id === (payload.new as any).id ? payload.new : q),
            )
          },
        )
        .subscribe(),
    )

    return () => { channels.forEach(ch => sb.removeChannel(ch)) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleStatus(itemId: string, status: 'upcoming' | 'in_progress' | 'done' | 'skipped') {
    await updateRosItemStatus(itemId, status)
    setRosItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, status }
        : status === 'in_progress' && item.status === 'in_progress'
          ? { ...item, status: 'upcoming' }
          : item
    ))
  }

  const STATUS_COLOR: Record<string, string> = {
    upcoming: 'var(--pz-muted)',
    in_progress: 'var(--pz-teal)',
    done: '#22C55E',
    skipped: '#EF4444',
  }

  const currentItem = rosItems.find(i => i.status === 'in_progress')
  const nextItem = rosItems.find(i => i.status === 'upcoming' && (!currentItem || i.time_at > currentItem.time_at))

  const filteredQA = selectedSession
    ? qaQuestions.filter(q => q.session_id === selectedSession)
    : qaQuestions

  const tabs: [Tab, string][] = [
    ['runofshow', '📋 Run of Show'],
    ['speakers', '🎙️ Speakers'],
    ['qa', `❓ Q&A (${qaQuestions.length})`],
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      {/* Header */}
      <div style={{ background: '#1E3A5F', padding: '1rem 1.5rem',
                    borderBottom: '2px solid var(--pz-teal)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex',
                      alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--pz-teal)',
                           textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              MC Hub
            </span>
            <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--pz-text)',
                         margin: '2px 0 0' }}>
              {event.title}
            </h1>
          </div>
          {currentItem && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 11, color: 'var(--pz-teal)', margin: 0 }}>NOW</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
                {currentItem.title}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex' }}>
          {tabs.map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: '0.875rem 1.25rem', fontSize: 14,
                       fontWeight: tab === t ? 700 : 400,
                       color: tab === t ? 'var(--pz-teal)' : 'var(--pz-muted)',
                       background: 'none', border: 'none',
                       borderBottom: tab === t ? '2px solid var(--pz-teal)' : '2px solid transparent',
                       cursor: 'pointer', marginBottom: -1 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '1.5rem' }}>

        {/* RUN OF SHOW TAB */}
        {tab === 'runofshow' && (
          <div>
            {nextItem && (
              <div style={{ padding: '0.75rem 1rem', background: 'var(--pz-surface)',
                            borderRadius: 8, marginBottom: '1rem',
                            border: '1px solid var(--pz-border)' }}>
                <p style={{ fontSize: 11, color: 'var(--pz-muted)', margin: '0 0 2px', textTransform: 'uppercase' }}>Up next</p>
                <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: 0 }}>
                  {nextItem.title} — {new Date(nextItem.time_at).toLocaleTimeString('en-US', { timeZone: event.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            )}
            {rosItems.length === 0 ? (
              <p style={{ color: 'var(--pz-muted)', textAlign: 'center', padding: '3rem' }}>
                No run of show items yet. Add them from the event admin.
              </p>
            ) : (
              rosItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', gap: 12, padding: '0.875rem',
                  background: item.status === 'in_progress' ? 'rgba(0,191,166,0.08)' : 'var(--pz-surface)',
                  borderRadius: 10, marginBottom: 8,
                  border: `1px solid ${item.status === 'in_progress' ? 'var(--pz-teal)' : 'var(--pz-border)'}`,
                }}>
                  <div style={{ width: 60, flexShrink: 0, textAlign: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-text)', margin: 0 }}>
                      {new Date(item.time_at).toLocaleTimeString('en-US', { timeZone: event.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--pz-muted)', margin: 0 }}>{item.duration_minutes}m</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--pz-text)', margin: '0 0 2px' }}>
                      {item.title}
                    </p>
                    {item.responsible_person && (
                      <p style={{ fontSize: 12, color: 'var(--pz-muted)', margin: 0 }}>
                        → {item.responsible_person}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                                   background: STATUS_COLOR[item.status] + '22',
                                   color: STATUS_COLOR[item.status] }}>
                      {item.status.replace('_', ' ')}
                    </span>
                    {item.status === 'upcoming' && (
                      <button onClick={() => handleStatus(item.id, 'in_progress')}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                                 border: '1px solid var(--pz-teal)', background: 'transparent',
                                 color: 'var(--pz-teal)', cursor: 'pointer' }}>
                        ▶ Start
                      </button>
                    )}
                    {item.status === 'in_progress' && (
                      <button onClick={() => handleStatus(item.id, 'done')}
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6,
                                 border: '1px solid #22C55E', background: 'transparent',
                                 color: '#22C55E', cursor: 'pointer' }}>
                        ✓ Done
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SPEAKERS TAB */}
        {tab === 'speakers' && (
          <div>
            {sessions.map((session: any) => {
              const speakers = (session.session_speakers ?? []).map((ss: any) => ss.speakers).filter(Boolean)
              if (!speakers.length) return null
              return (
                <div key={session.id} style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--pz-muted)',
                               textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
                    {session.title} — {new Date(session.starts_at).toLocaleTimeString('en-US', { timeZone: event.timezone ?? 'UTC', hour: 'numeric', minute: '2-digit' })}
                  </h3>
                  {speakers.map((sp: any) => (
                    <div key={sp.id} style={{ display: 'flex', gap: 12, padding: '1rem',
                                              background: 'var(--pz-surface)', borderRadius: 12,
                                              border: '1px solid var(--pz-border)', marginBottom: 8 }}>
                      {sp.photo_url && (
                        <img src={sp.photo_url} alt={sp.name}
                          style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 800, fontSize: 16, color: 'var(--pz-text)', margin: '0 0 2px' }}>
                          {sp.name}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--pz-muted)', margin: '0 0 6px' }}>
                          {sp.job_title}{sp.company ? `, ${sp.company}` : ''}
                        </p>
                        {sp.bio && (
                          <p style={{ fontSize: 13, color: 'var(--pz-text)', margin: 0,
                                      lineHeight: 1.5, display: '-webkit-box',
                                      WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                                      overflow: 'hidden' }}>
                            {sp.bio}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* Q&A TAB */}
        {tab === 'qa' && (
          <div>
            {sessions.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
                <button onClick={() => setSelectedSession(null)}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                           border: `1px solid ${selectedSession === null ? 'var(--pz-teal)' : 'var(--pz-border)'}`,
                           background: selectedSession === null ? 'rgba(0,191,166,0.13)' : 'transparent',
                           color: selectedSession === null ? 'var(--pz-teal)' : 'var(--pz-muted)' }}>
                  All sessions
                </button>
                {sessions.map((s: any) => (
                  <button key={s.id} onClick={() => setSelectedSession(s.id)}
                    style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                             border: `1px solid ${selectedSession === s.id ? 'var(--pz-teal)' : 'var(--pz-border)'}`,
                             background: selectedSession === s.id ? 'rgba(0,191,166,0.13)' : 'transparent',
                             color: selectedSession === s.id ? 'var(--pz-teal)' : 'var(--pz-muted)' }}>
                    {s.title.length > 20 ? s.title.slice(0, 20) + '…' : s.title}
                  </button>
                ))}
              </div>
            )}
            {filteredQA.length === 0 ? (
              <p style={{ color: 'var(--pz-muted)', textAlign: 'center', padding: '3rem' }}>
                No Q&A questions yet.
              </p>
            ) : (
              filteredQA.map(q => (
                <div key={q.id} style={{ padding: '0.875rem', background: 'var(--pz-surface)',
                                         borderRadius: 10, marginBottom: 8,
                                         border: q.is_pinned ? '1px solid var(--pz-teal)' : '1px solid var(--pz-border)' }}>
                  {q.is_pinned && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--pz-teal)',
                                   textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      📌 Pinned
                    </span>
                  )}
                  <p style={{ fontSize: 14, color: 'var(--pz-text)', margin: '4px 0' }}>
                    {q.question_text ?? q.body}
                  </p>
                  {q.organizer_answer && (
                    <div style={{ marginTop: 8, padding: '6px 10px',
                                  background: 'rgba(0,191,166,0.08)', borderLeft: '3px solid var(--pz-teal)',
                                  borderRadius: 4 }}>
                      <p style={{ fontSize: 12, color: 'var(--pz-teal)', fontWeight: 700, margin: '0 0 2px' }}>Answer</p>
                      <p style={{ fontSize: 13, color: 'var(--pz-text)', margin: 0 }}>{q.organizer_answer}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
