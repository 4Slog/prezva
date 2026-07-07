import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublicEvent, getPublicAgenda } from '@/lib/public/actions'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import AgendaClient from './client'

export default async function PublicAgendaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEvent(slug)
  if (!event) notFound()
  const sessions = await getPublicAgenda(event.id)
  const identity = await getSessionIdentity(slug)
  const registered =
    identity.type === 'user' ||
    (identity.type === 'registration' && identity.eventId === event.id)

  const sessionIds = sessions.map((s: any) => s.id)
  const handoutsBySession: Record<string, any[]> = {}
  if (registered && sessionIds.length > 0) {
    const admin = createAdminClient()
    const { data: handouts } = await admin
      .from('session_handouts')
      .select('id, session_id, filename, storage_path')
      .in('session_id', sessionIds)
    for (const h of (handouts ?? []) as any[]) {
      if (!handoutsBySession[h.session_id]) handoutsBySession[h.session_id] = []
      handoutsBySession[h.session_id].push(h)
    }
  }

  let userId: string | null = null
  let registrationId: string | null = null
  if (identity.type === 'user') {
    userId = identity.userId
    const supabase = await createClient()
    const { data: reg } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', event.id)
      .eq('user_id', identity.userId)
      .eq('status', 'confirmed')
      .maybeSingle()
    registrationId = reg?.id ?? null
  } else if (identity.type === 'registration' && identity.eventId === event.id) {
    registrationId = identity.registrationId
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pz-bg)' }}>
      <div style={{ background: 'var(--pz-surface)', borderBottom: '1px solid var(--pz-border)', padding: '2rem 1.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <Link href={'/e/' + slug} style={{ color: 'var(--pz-teal-ink)', textDecoration: 'none', fontSize: 13 }}>Back to event</Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.5rem', color: 'var(--pz-text)' }}>Agenda</h1>
        </div>
      </div>
      <div style={{ maxWidth: 800, margin: '2rem auto', padding: '0 1.5rem' }}>
        <AgendaClient sessions={sessions} eventId={event.id} userId={userId} handoutsBySession={handoutsBySession} eventSlug={slug} timezone={(event as any).timezone ?? 'UTC'} registrationId={registrationId} />
      </div>
    </div>
  )
}
