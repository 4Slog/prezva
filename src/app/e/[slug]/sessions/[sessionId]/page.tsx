import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'
import { getSessionMessages, getSessionQuestions } from '@/lib/agenda/sprint6-actions'
import { SessionChat } from './session-chat'
import { SessionNotes } from './session-notes'

type Props = { params: Promise<{ slug: string; sessionId: string }> }

export default async function SessionDetailPage({ params }: Props) {
  const { slug, sessionId } = await params
  const user = await getUser()
  const supabase = await createClient()

  const { data: session } = await supabase
    .from('sessions')
    .select(`
      id, title, description, session_type, starts_at, ends_at, capacity,
      video_url, tags, recording_url, slides_url,
      tracks(id, name, color),
      rooms(id, name),
      session_speakers(speakers(id, name, job_title, company)),
      events!inner(id, title, slug)
    `)
    .eq('id', sessionId)
    .single()

  if (!session || (session as any).events?.slug !== slug) notFound()

  const [initialMessages, initialQuestions] = await Promise.all([
    getSessionMessages(sessionId),
    getSessionQuestions(sessionId),
  ])

  const ev = (session as any).events
  const typeColor: Record<string, string> = {
    talk: '#0891b2', workshop: '#7c3aed', panel: '#d97706',
    keynote: '#059669', break: '#6b7280', networking: '#db2777', other: '#64748b',
  }
  const color = (session as any).tracks?.color ?? typeColor[(session as any).session_type] ?? '#64748b'

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      {/* Header */}
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <a href={`/e/${slug}/agenda`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
            ← {ev?.title ?? 'Agenda'}
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Session header */}
            <div className="pz-card p-6 mb-6" style={{ borderLeft: `4px solid ${color}` }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium capitalize"
                  style={{ background: color + '22', color }}
                >
                  {(session as any).session_type}
                </span>
                {((session as any).tags ?? []).map((tag: string) => (
                  <span key={tag} className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-label)' }}>
                    {tag}
                  </span>
                ))}
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--pz-text)' }}>{(session as any).title}</h1>
              <p className="text-sm mb-3" style={{ color: 'var(--pz-muted)' }}>
                {fmtDate((session as any).starts_at)} · {fmtTime((session as any).starts_at)} – {fmtTime((session as any).ends_at)}
                {(session as any).rooms?.name && ` · ${(session as any).rooms.name}`}
                {(session as any).capacity && ` · cap. ${(session as any).capacity}`}
              </p>
              {(session as any).session_speakers?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {(session as any).session_speakers.map((ss: any) => ss.speakers).filter(Boolean).map((sp: any) => (
                    <div key={sp.id} className="rounded-full px-3 py-1 text-xs" style={{ background: 'var(--pz-surface-2)', color: 'var(--pz-muted)' }}>
                      {sp.name}{sp.job_title ? ` — ${sp.job_title}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video embed */}
            {(session as any).video_url && (
              <div className="pz-card p-4 mb-6">
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>Session video</h2>
                <a
                  href={(session as any).video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
                  style={{ background: 'var(--pz-teal)', color: '#0D1B2A' }}
                >
                  Watch / Join session →
                </a>
              </div>
            )}

            {/* Description */}
            {(session as any).description && (
              <div className="pz-card p-5 mb-6">
                <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--pz-label)' }}>About this session</h2>
                <p className="text-sm whitespace-pre-line" style={{ color: 'var(--pz-text)' }}>
                  {(session as any).description}
                </p>
              </div>
            )}

            {/* Resources */}
            {((session as any).slides_url || (session as any).recording_url) && (
              <div className="pz-card p-5 mb-6">
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>Resources</h2>
                <div className="flex flex-wrap gap-3">
                  {(session as any).slides_url && (
                    <a href={(session as any).slides_url} target="_blank" rel="noreferrer" className="text-sm hover:opacity-70" style={{ color: 'var(--pz-teal)' }}>
                      Slides →
                    </a>
                  )}
                  {(session as any).recording_url && (
                    <a href={(session as any).recording_url} target="_blank" rel="noreferrer" className="text-sm hover:opacity-70" style={{ color: 'var(--pz-teal)' }}>
                      Recording →
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Notes (authenticated only) */}
            {user && (
              <div className="pz-card p-5 mb-6">
                <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-label)' }}>My notes</h2>
                <SessionNotes sessionId={sessionId} />
              </div>
            )}
          </div>

          {/* Chat / Q&A sidebar */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="pz-card p-4 sticky top-4">
              <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--pz-text)' }}>Chat & Q&A</h2>
              <SessionChat
                sessionId={sessionId}
                userId={user?.id ?? null}
                initialMessages={initialMessages as any}
                initialQuestions={initialQuestions as any}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
