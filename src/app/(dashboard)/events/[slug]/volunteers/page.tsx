import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { VolunteersClient } from './volunteers-client'

type Props = { params: Promise<{ slug: string }> }

export default async function VolunteersPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, title, org_id')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) return <p style={{ color: 'var(--pz-muted)', padding: '2rem' }}>Event not found.</p>

  const { data: volunteers } = await admin
    .from('volunteers')
    .select('*')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, title, starts_at')
    .eq('event_id', event.id)
    .eq('is_published', true)
    .order('starts_at', { ascending: true })

  const { data: alerts } = await admin
    .from('volunteer_alerts')
    .select('id, volunteer_id, alert_type, message, resolved, created_at, volunteers(name)')
    .eq('event_id', event.id)
    .eq('resolved', false)
    .order('created_at', { ascending: false })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event.title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Volunteers</span>
      </div>

      <VolunteersClient
        eventId={event.id}
        eventSlug={slug}
        volunteers={(volunteers ?? []) as any[]}
        sessions={(sessions ?? []) as any[]}
        alerts={(alerts ?? []) as any[]}
      />
    </div>
  )
}
