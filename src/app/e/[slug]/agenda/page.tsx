import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicAgenda } from '@/lib/public/actions'
import { getUser } from '@/lib/auth/get-user'
import AgendaClient from './client'

export default async function PublicAgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const sessions = await getPublicAgenda(event.id)
  const user = await getUser()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <div style={{ background: 'var(--color-navy)', color: '#fff', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href={'/e/' + slug} style={{ color: 'var(--color-teal)', textDecoration: 'none', fontSize: 13 }}>Back to event</Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem' }}>Agenda</h1>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1.5rem' }}>
        <AgendaClient sessions={sessions} eventId={event.id} userId={user?.id ?? null} />
      </div>
    </div>
  )
}
