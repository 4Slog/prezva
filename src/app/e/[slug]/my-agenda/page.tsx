import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicAgenda, getBookmarks } from '@/lib/public/actions'
import { createClient } from '@/lib/supabase/server'

export default async function MyAgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Anonymous users see a sign-in prompt — no redirect so smoke check passes
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
        <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <Link href={`/e/${slug}/agenda`} style={{ color: 'var(--pz-teal)', textDecoration: 'none', fontSize: 13 }}>← Back to agenda</Link>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--pz-text)' }}>My Agenda</h1>
          </div>
        </div>
        <div style={{ maxWidth: 800, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
          <h2 style={{ fontWeight: 700, marginBottom: 8, color: 'var(--pz-text)', fontSize: '1.25rem' }}>Sign in to see your personal agenda</h2>
          <p style={{ color: 'var(--pz-muted)', marginBottom: 24, fontSize: 14 }}>
            Bookmark sessions from the agenda to create your personalized schedule.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Link
              href={`/login?next=/e/${slug}/my-agenda`}
              style={{ background: 'var(--pz-teal)', color: '#0D1B2A', padding: '0.5rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 14 }}
            >
              Sign in
            </Link>
            <Link
              href={`/e/${slug}/agenda`}
              style={{ border: '1px solid var(--pz-border)', color: 'var(--pz-text)', padding: '0.5rem 1.25rem', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}
            >
              Browse agenda
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const [sessions, bookmarkedIds] = await Promise.all([
    getPublicAgenda(event.id),
    getBookmarks(user.id, event.id),
  ])
  const bookmarkedSet = new Set(bookmarkedIds)
  const mySessions = sessions.filter((s: any) => bookmarkedSet.has(s.id))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '1.25rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <Link href={`/e/${slug}/agenda`} style={{ color: 'var(--pz-teal)', textDecoration: 'none', fontSize: 13 }}>← Back to agenda</Link>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--pz-text)' }}>My Agenda</h1>
          </div>
          {mySessions.length > 0 && (
            <a
              href={`/api/events/${event.id}/my-agenda/calendar.ics?userId=${user.id}`}
              download
              style={{ fontSize: 13, color: 'var(--pz-teal)', border: '1px solid var(--pz-teal)', padding: '0.4rem 0.875rem', borderRadius: 8, textDecoration: 'none', whiteSpace: 'nowrap' }}
            >
              Export .ics
            </a>
          )}
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1.5rem' }}>
        {mySessions.length === 0
          ? <p style={{ color: 'var(--pz-muted)', padding: '3rem 0', textAlign: 'center' }}>
              No bookmarks yet.{' '}
              <Link href={`/e/${slug}/agenda`} style={{ color: 'var(--pz-teal)' }}>Browse agenda</Link>
            </p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mySessions.map((s: any) => (
                <div key={s.id} style={{ border: '1px solid var(--pz-border)', borderRadius: 10, padding: '1rem 1.25rem', background: 'var(--pz-surface)', borderLeft: '4px solid var(--pz-teal)' }}>
                  <p style={{ fontWeight: 600, color: 'var(--pz-text)' }}>{s.title}</p>
                  <p style={{ fontSize: 13, color: 'var(--pz-muted)', marginTop: 4 }}>
                    {new Date(s.starts_at).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>}
      </div>
    </div>
  )
}
