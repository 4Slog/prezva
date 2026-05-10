import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicAgenda, getBookmarks } from '@/lib/public/actions'
import { requireUser } from '@/lib/auth/get-user'

export default async function MyAgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  let user: any
  try { user = await requireUser() } catch { redirect('/login') }
  const [sessions, bookmarkedIds] = await Promise.all([getPublicAgenda(event.id), getBookmarks(user.id, event.id)])
  const bookmarkedSet = new Set(bookmarkedIds)
  const mySessions = sessions.filter((s: any) => bookmarkedSet.has(s.id))
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <div style={{ background: 'var(--color-navy)', color: '#fff', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href={'/e/' + slug + '/agenda'} style={{ color: 'var(--color-teal)', textDecoration: 'none', fontSize: 13 }}>Back to agenda</Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>My Agenda</h1>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1.5rem' }}>
        {mySessions.length === 0
          ? <p style={{ color: 'var(--color-text-muted)', padding: '3rem 0', textAlign: 'center' }}>
              No bookmarks yet.{' '}
              <Link href={'/e/' + slug + '/agenda'} style={{ color: 'var(--color-teal)' }}>Browse agenda</Link>
            </p>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mySessions.map((s: any) => (
                <div key={s.id} style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '1rem 1.25rem', background: 'var(--color-surface)', borderLeft: '4px solid var(--color-teal)' }}>
                  <p style={{ fontWeight: 600 }}>{s.title}</p>
                  <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {new Date(s.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>}
      </div>
    </div>
  )
}
