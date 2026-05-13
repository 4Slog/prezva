import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSponsors } from '@/lib/sponsors/actions'
import Link from 'next/link'
import { SponsorsClient } from './sponsors-client'

type Props = { params: Promise<{ slug: string }> }

export default async function EventSponsorsAdminPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: read event for admin view
  const admin = createAdminClient()
  const { data: event } = await admin
    .from('events')
    .select('id, title')
    .eq('slug', slug)
    .maybeSingle()

  if (!event) return <p style={{ color: 'var(--pz-muted)', padding: '2rem' }}>Event not found.</p>

  const sponsors = await getSponsors(event.id)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event.title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Sponsors</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--pz-text)', marginBottom: 4 }}>Sponsors</h1>
          <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
            Sponsors appear on{' '}
            <Link href={`/e/${slug}#sponsors`} style={{ color: 'var(--pz-teal)' }}>the event page</Link>
            {' '}grouped by tier.
          </p>
        </div>
        {sponsors.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{sponsors.length} sponsor{sponsors.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      <SponsorsClient
        eventId={event.id}
        eventSlug={slug}
        sponsors={sponsors as any}
      />
    </div>
  )
}
