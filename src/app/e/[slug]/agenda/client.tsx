'use client'
import { useState, useTransition } from 'react'
import { Bookmark, BookmarkCheck, CheckCircle2 } from 'lucide-react'
import { toggleBookmark } from '@/lib/public/bookmark-actions'
import { markSessionAttendance } from '@/lib/checkin/session-checkin-actions'

interface Session {
  id: string; title: string; session_type: string
  starts_at: string; ends_at: string
  tracks?: { id: string; name: string; color: string } | null
  rooms?: { id: string; name: string } | null
  session_speakers?: { speakers: { id: string; name: string } | null }[]
  virtual_url?: string | null
}
type AgendaClientProps = {
  sessions: Session[]
  eventId: string
  userId: string | null
  handoutsBySession?: Record<string, any[]>
  eventSlug?: string
  timezone?: string
}
const COLORS: Record<string,string> = {
  keynote:'#7c3aed', talk:'#0891b2', workshop:'#d97706',
  panel:'#059669', break:'#6b7280', networking:'#db2777', other:'#64748b'
}

function MarkAttendanceButton({ sessionId, eventId, userId }: { sessionId: string; eventId: string; userId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [, startTransition] = useTransition()

  function handleClick() {
    setState('loading')
    startTransition(async () => {
      const result = await markSessionAttendance(sessionId, eventId)
      if (result.error) setState('error')
      else setState('done')
    })
  }

  if (state === 'done') return (
    <span style={{ fontSize:11, color:'var(--color-teal)', display:'flex', alignItems:'center', gap:3 }}>
      <CheckCircle2 size={13} /> Attended
    </span>
  )
  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      style={{ fontSize:11, color:'var(--color-teal)', textDecoration:'none', background:'var(--color-teal)22', padding:'2px 8px', borderRadius:10, border:'none', cursor:'pointer', whiteSpace:'nowrap', opacity: state === 'loading' ? 0.6 : 1 }}
    >
      {state === 'loading' ? '…' : state === 'error' ? 'Error' : 'Mark Attended'}
    </button>
  )
}

export default function AgendaClient({ sessions, eventId, userId, handoutsBySession = {}, eventSlug = '', timezone = 'UTC' }: AgendaClientProps) {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const grouped: Record<string,Session[]> = {}
  for (const s of sessions) {
    const day = new Date(s.starts_at).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:timezone})
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(s)
  }
  function handleBookmark(sessionId: string) {
    if (!userId) { window.location.assign('/login'); return }
    setBookmarks(prev => { const n = new Set(prev); if (n.has(sessionId)) { n.delete(sessionId) } else { n.add(sessionId) } return n })
    startTransition(() => { toggleBookmark(userId, eventId, sessionId) })
  }
  if (sessions.length === 0) return (
    <p style={{ color:'var(--color-text-muted)', textAlign:'center', padding:'3rem 0' }}>No sessions published yet.</p>
  )
  return (
    <div>
      {Object.entries(grouped).map(([day, daySessions]) => (
        <div key={day} style={{ marginBottom:'2.5rem' }}>
          <h2 style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:'1rem' }}>{day}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {daySessions.map(s => {
              const color = s.tracks?.color ?? COLORS[s.session_type] ?? '#64748b'
              const spks = s.session_speakers?.map(ss => ss.speakers).filter(Boolean) ?? []
              const borderStyle = '4px solid ' + color
              const isActive = new Date() >= new Date(s.starts_at) && new Date() <= new Date(s.ends_at)
              const isEnded = new Date(s.ends_at) < new Date()
              return (
                <div key={s.id} style={{ border:'1px solid var(--color-border)', borderRadius:10, padding:'1rem 1.25rem', background:'var(--color-surface)', borderLeft:borderStyle, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, textTransform:'uppercase', background:color+'22', color }}>{s.session_type}</span>
                      <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>
                        {new Date(s.starts_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} - {new Date(s.ends_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}
                      </span>
                      {s.rooms?.name && <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>· {s.rooms.name}</span>}
                    </div>
                    <p style={{ fontWeight:600, marginBottom: spks.length > 0 ? 6 : 0 }}>{s.title}</p>
                    {spks.length > 0 && <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>{(spks as any[]).map(sp => sp.name).join(', ')}</p>}
                    {(handoutsBySession[s.id]?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {handoutsBySession[s.id].map((h: any) => (
                          <a
                            key={h.id}
                            href={`/api/speaker/handouts/${h.id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11, color: 'var(--color-teal)', textDecoration: 'none', background: 'var(--color-teal)22', padding: '2px 8px', borderRadius: 10 }}
                          >
                            📎 {h.filename}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                    {s.virtual_url && (() => {
                      const now = Date.now()
                      const sessionStart = new Date(s.starts_at).getTime()
                      const sessionEnd = new Date(s.ends_at).getTime()
                      const showJoin = now >= sessionStart - 15 * 60 * 1000 && now <= sessionEnd
                      return showJoin ? (
                        <a
                          href={s.virtual_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize:12, background:'#00BFA6', color:'#0D1B2A', padding:'6px 12px', borderRadius:6, fontWeight:700, textDecoration:'none' }}
                        >
                          Join session
                        </a>
                      ) : null
                    })()}
                    {userId && (isActive || isEnded) && (
                      <MarkAttendanceButton sessionId={s.id} eventId={eventId} userId={userId} />
                    )}
                    {eventSlug && isEnded && (
                      <a
                        href={`/e/${eventSlug}/feedback/${s.id}`}
                        style={{ fontSize:11, color:'var(--color-teal)', textDecoration:'none', background:'var(--color-teal)22', padding:'2px 8px', borderRadius:10, whiteSpace:'nowrap' }}
                      >
                        Rate
                      </a>
                    )}
                    <button onClick={() => handleBookmark(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color: bookmarks.has(s.id) ? 'var(--color-teal)' : 'var(--color-text-muted)', padding:'4px' }}>
                      {bookmarks.has(s.id) ? <BookmarkCheck size={18}/> : <Bookmark size={18}/>}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
