'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import { Bookmark, BookmarkCheck, CheckCircle2 } from 'lucide-react'
import { toggleBookmark } from '@/lib/public/bookmark-actions'
import { markSessionAttendance } from '@/lib/checkin/session-checkin-actions'
import { submitVote } from '@/lib/engagement/poll-actions'
import { createCommunityPost, getCommunityPosts } from '@/lib/networking/sprint8-actions'
import { createClient } from '@/lib/supabase/client'
import SessionCheckInButton from '@/components/sessions/SessionCheckInButton'

interface Session {
  id: string; title: string; session_type: string
  starts_at: string; ends_at: string
  tracks?: { id: string; name: string; color: string } | null
  rooms?: { id: string; name: string } | null
  session_speakers?: { role?: string; speakers: { id: string; name: string } | null }[]
  virtual_url?: string | null
  sponsored_by?: { id: string; name: string; logo_url: string | null; website_url: string | null } | null
}
type AgendaClientProps = {
  sessions: Session[]
  eventId: string
  userId: string | null
  handoutsBySession?: Record<string, any[]>
  eventSlug?: string
  timezone?: string
  registrationId?: string | null
}

type LivePoll = {
  id: string
  session_id: string
  question: string
  options: string[]
  show_results: boolean
  is_active: boolean
}

function LivePollCard({ poll, userId, registrationId }: { poll: LivePoll; userId: string | null; registrationId?: string | null }) {
  const [voted, setVoted] = useState(false)
  const [votedIndex, setVotedIndex] = useState<number | null>(null)
  const [counts, setCounts] = useState<number[]>(poll.options.map(() => 0))
  const [total, setTotal] = useState(0)
  const sbRef = useRef(createClient())

  useEffect(() => {
    const sb = sbRef.current
    const fetchCounts = async () => {
      const { data } = await sb.from('session_poll_votes').select('option_index').eq('poll_id', poll.id)
      if (data) {
        const c = poll.options.map((_: string, i: number) => data.filter((v: any) => v.option_index === i).length)
        setCounts(c)
        setTotal(data.length)
      }
    }
    fetchCounts()
    const ch = sb.channel(`poll_votes:${poll.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_poll_votes', filter: `poll_id=eq.${poll.id}` }, () => fetchCounts())
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [poll.id, poll.options])

  async function handleVote(i: number) {
    if (voted) return
    setVoted(true)
    setVotedIndex(i)
    await submitVote(poll.id, i, userId ?? undefined, registrationId ?? undefined)
  }

  const showBar = voted || poll.show_results

  return (
    <div style={{ background: 'var(--color-teal)11', border: '1px solid var(--color-teal)44', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--color-teal)', background: 'var(--color-teal)22', padding: '2px 8px', borderRadius: 20 }}>Live Poll</span>
      </div>
      <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 10, color: 'var(--color-text)' }}>{poll.question}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {poll.options.map((opt: string, i: number) => (
          <button
            key={i}
            onClick={() => handleVote(i)}
            disabled={voted}
            style={{
              position: 'relative',
              textAlign: 'left',
              padding: '8px 12px',
              borderRadius: 8,
              border: votedIndex === i ? '1px solid var(--color-teal)' : '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              cursor: voted ? 'default' : 'pointer',
              overflow: 'hidden',
              fontSize: 13,
              color: 'var(--color-text)',
            }}
          >
            {showBar && total > 0 && (
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--color-teal)22', width: `${(counts[i] / total) * 100}%`, transition: 'width 0.4s' }} />
            )}
            <span style={{ position: 'relative' }}>{opt}</span>
            {showBar && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-text-muted)' }}>{total > 0 ? Math.round((counts[i] / total) * 100) : 0}%</span>}
          </button>
        ))}
      </div>
      {voted && <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>{poll.show_results ? `${total} vote${total !== 1 ? 's' : ''}` : 'Vote recorded'}</p>}
    </div>
  )
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

function SessionDiscussionPanel({ sessionId, eventId, eventSlug, userId }: { sessionId: string; eventId: string; eventSlug: string; userId: string | null }) {
  const [posts, setPosts] = useState<any[]>([])
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const sbRef = useRef(createClient())

  useEffect(() => {
    getCommunityPosts(eventId, undefined, 0, sessionId).then(setPosts)
    const sb = sbRef.current
    const ch = sb.channel(`session_discussion:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts', filter: `session_id=eq.${sessionId}` }, (payload) => {
        setPosts(prev => [payload.new as any, ...prev])
      })
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [sessionId, eventId])

  async function handlePost() {
    if (!userId || !body.trim()) return
    setSubmitting(true)
    await createCommunityPost(eventId, { post_type: 'post', body: body.trim(), session_id: sessionId })
    setBody('')
    setSubmitting(false)
    getCommunityPosts(eventId, undefined, 0, sessionId).then(setPosts)
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Discussion</p>
      {posts.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          No posts yet.{' '}
          <a href={`/e/${eventSlug}/community`} style={{ color: 'var(--color-teal)', textDecoration: 'none' }}>Visit community feed</a>
        </p>
      )}
      {posts.slice(0, 5).map((p: any) => (
        <div key={p.id} style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--color-surface-2, var(--color-surface))' }}>
          {p.body}
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', marginLeft: 8 }}>{new Date(p.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
        </div>
      ))}
      {posts.length > 5 && (
        <a href={`/e/${eventSlug}/community`} style={{ fontSize: 12, color: 'var(--color-teal)', textDecoration: 'none' }}>See all {posts.length} posts →</a>
      )}
      {userId ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePost() } }}
            placeholder="Join the discussion…"
            style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', outline: 'none' }}
          />
          <button onClick={handlePost} disabled={submitting || !body.trim()} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--color-teal)', color: '#0D1B2A', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>Post</button>
        </div>
      ) : (
        <a href={`/login?next=/e/${eventSlug}/agenda`} style={{ fontSize: 12, color: 'var(--color-teal)', textDecoration: 'none' }}>Sign in to join the discussion</a>
      )}
    </div>
  )
}

export default function AgendaClient({ sessions, eventId, userId, handoutsBySession = {}, eventSlug = '', timezone = 'UTC', registrationId = null }: AgendaClientProps) {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null)
  const [activePollsBySession, setActivePollsBySession] = useState<Record<string, LivePoll>>({})
  const [expandedDiscussion, setExpandedDiscussion] = useState<string | null>(null)
  const sbRef = useRef(createClient())

  useEffect(() => {
    const sb = sbRef.current
    // Fetch currently active polls for this event
    const fetchPolls = async () => {
      const { data } = await sb.from('session_polls').select('*').eq('event_id', eventId).eq('is_active', true)
      if (data) {
        const map: Record<string, LivePoll> = {}
        for (const p of data) map[p.session_id] = p
        setActivePollsBySession(map)
      }
    }
    fetchPolls()
    const ch = sb.channel(`active_polls:${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_polls', filter: `event_id=eq.${eventId}` }, fetchPolls)
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [eventId])

  // Build unique days and tracks for filters
  const allDays = Array.from(new Set(sessions.map(s =>
    new Date(s.starts_at).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:timezone})
  )))
  const allTracks = Array.from(new Map(
    sessions.filter(s => s.tracks).map(s => [s.tracks!.id, s.tracks!])
  ).values())

  // Apply filters
  const filteredSessions = sessions.filter(s => {
    const day = new Date(s.starts_at).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:timezone})
    if (selectedDay && day !== selectedDay) return false
    if (selectedTrack && s.tracks?.id !== selectedTrack) return false
    return true
  })

  const grouped: Record<string,Session[]> = {}
  for (const s of filteredSessions) {
    const day = new Date(s.starts_at).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:timezone})
    if (!grouped[day]) grouped[day] = []
    grouped[day].push(s)
  }
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)

  function handleBookmark(sessionId: string) {
    if (!userId) { setShowLoginPrompt(true); return }
    setBookmarks(prev => { const n = new Set(prev); if (n.has(sessionId)) { n.delete(sessionId) } else { n.add(sessionId) } return n })
    startTransition(() => { toggleBookmark(userId, eventId, sessionId) })
  }
  if (sessions.length === 0) return (
    <p style={{ color:'var(--color-text-muted)', textAlign:'center', padding:'3rem 0' }}>No sessions published yet.</p>
  )
  return (
    <div>
      {showLoginPrompt && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--color-teal)11', border: '1px solid var(--color-teal)44', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--color-text)' }}>Sign in to bookmark sessions</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {eventSlug && <a href={`/login?next=/e/${eventSlug}/agenda`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-teal)', textDecoration: 'none' }}>Sign in</a>}
            <button onClick={() => setShowLoginPrompt(false)} style={{ fontSize: 12, color: 'var(--color-text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        </div>
      )}
      {/* Day + Track filters */}
      {(allDays.length > 1 || allTracks.length > 0) && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:'1.5rem' }}>
          {allDays.length > 1 && (
            <select
              value={selectedDay ?? ''}
              onChange={e => setSelectedDay(e.target.value || null)}
              style={{ fontSize:13, padding:'6px 10px', borderRadius:8, border:'1px solid var(--color-border)', background:'var(--color-surface)', color:'var(--color-text)', cursor:'pointer' }}
            >
              <option value=''>All days</option>
              {allDays.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {allTracks.length > 0 && (
            <select
              value={selectedTrack ?? ''}
              onChange={e => setSelectedTrack(e.target.value || null)}
              style={{ fontSize:13, padding:'6px 10px', borderRadius:8, border:'1px solid var(--color-border)', background:'var(--color-surface)', color:'var(--color-text)', cursor:'pointer' }}
            >
              <option value=''>All tracks</option>
              {allTracks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {(selectedDay || selectedTrack) && (
            <button
              onClick={() => { setSelectedDay(null); setSelectedTrack(null) }}
              style={{ fontSize:12, padding:'6px 10px', borderRadius:8, border:'1px solid var(--color-border)', background:'transparent', color:'var(--color-text-muted)', cursor:'pointer' }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {Object.entries(grouped).map(([day, daySessions]) => (
        <div key={day} style={{ marginBottom:'2.5rem' }}>
          <h2 style={{ fontWeight:700, fontSize:'0.9rem', color:'var(--color-text-muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:'1rem' }}>{day}</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {daySessions.map(s => {
              const color = s.tracks?.color ?? COLORS[s.session_type] ?? '#64748b'
              const spks = s.session_speakers?.filter(ss => ss.speakers).map(ss => ({ ...ss.speakers!, role: ss.role ?? 'presenter' })) ?? []
              const borderStyle = '4px solid ' + color
              const isActive = new Date() >= new Date(s.starts_at) && new Date() <= new Date(s.ends_at)
              const isEnded = new Date(s.ends_at) < new Date()
              return (
                <div key={s.id} style={{ border:'1px solid var(--color-border)', borderRadius:10, padding:'1rem 1.25rem', background:'var(--color-surface)', borderLeft:borderStyle }}>
                  {activePollsBySession[s.id] && (
                    <LivePollCard poll={activePollsBySession[s.id]} userId={userId} registrationId={registrationId} />
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:20, textTransform:'uppercase', background:color+'22', color }}>{s.session_type}</span>
                      <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>
                        {new Date(s.starts_at).toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'})} - {new Date(s.ends_at).toLocaleTimeString('en-US',{timeZone:timezone,hour:'numeric',minute:'2-digit'})}
                      </span>
                      {s.rooms?.name && <span style={{ fontSize:12, color:'var(--color-text-muted)' }}>· {s.rooms.name}</span>}
                    </div>
                    <p style={{ fontWeight:600, marginBottom: spks.length > 0 ? 6 : 0 }}>{s.title}</p>
                    {(s as any).sponsored_by?.name && (
                      <p style={{ fontSize:11, color:'var(--color-text-muted)', marginBottom: spks.length > 0 ? 4 : 0 }}>
                        Sponsored by {(s as any).sponsored_by.name}
                      </p>
                    )}
                    {spks.length > 0 && (
                      <p style={{ fontSize:13, color:'var(--color-text-muted)' }}>
                        {spks.map((sp, i) => (
                          <span key={sp.id}>
                            {i > 0 && ', '}
                            {sp.name}
                            {sp.role && sp.role !== 'presenter' && (
                              <span style={{ fontSize:11, marginLeft:3 }}>({sp.role.charAt(0).toUpperCase() + sp.role.slice(1)})</span>
                            )}
                          </span>
                        ))}
                      </p>
                    )}
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
                    {registrationId && (
                      <SessionCheckInButton registrationId={registrationId} sessionId={s.id} sessionStartsAt={s.starts_at} />
                    )}
                    {eventSlug && isEnded && (
                      <a
                        href={`/e/${eventSlug}/feedback/${s.id}`}
                        style={{ fontSize:11, color:'var(--color-teal)', textDecoration:'none', background:'var(--color-teal)22', padding:'2px 8px', borderRadius:10, whiteSpace:'nowrap' }}
                      >
                        Rate
                      </a>
                    )}
                    <button
                      onClick={() => setExpandedDiscussion(prev => prev === s.id ? null : s.id)}
                      style={{ fontSize:11, color: expandedDiscussion === s.id ? 'var(--color-teal)' : 'var(--color-text-muted)', background:'none', border:'none', cursor:'pointer', padding:'4px', whiteSpace:'nowrap' }}
                    >
                      💬
                    </button>
                    <button onClick={() => handleBookmark(s.id)} style={{ background:'none', border:'none', cursor:'pointer', color: bookmarks.has(s.id) ? 'var(--color-teal)' : 'var(--color-text-muted)', padding:'4px' }}>
                      {bookmarks.has(s.id) ? <BookmarkCheck size={18}/> : <Bookmark size={18}/>}
                    </button>
                    <a href={`/api/events/${eventId}/sessions/${s.id}/calendar.ics`} download title="Add to calendar" style={{ color:'var(--color-text-muted)', padding:'4px', textDecoration:'none', fontSize:16 }}>📅</a>
                  </div>
                  </div>
                  {expandedDiscussion === s.id && (
                    <SessionDiscussionPanel sessionId={s.id} eventId={eventId} eventSlug={eventSlug} userId={userId} />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
