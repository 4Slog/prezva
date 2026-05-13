import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { DeadLettersClient } from './dead-letters-client'

type Props = { params: Promise<{ slug: string }> }

export default async function DeadLettersPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: read event and dead-letter items for this event
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) return <p style={{ color: 'var(--pz-muted)', padding: '2rem' }}>Event not found.</p>

  const { data: items } = await admin
    .from('dead_letter_items')
    .select('*')
    .eq('event_id', event.id)
    .order('last_failed_at', { ascending: false })
    .limit(100)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event.title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Failed Jobs</span>
      </div>

      <DeadLettersClient items={(items ?? []) as any[]} eventSlug={slug} />
    </div>
  )
}
