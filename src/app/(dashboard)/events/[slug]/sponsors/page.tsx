import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function EventSponsorsAdminPage({ params }: Props) {
  const { slug } = await params
  await requireUser()

  // Admin client: sponsor count for admin view
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id, title').eq('slug', slug).maybeSingle()
  const { count } = event
    ? await admin.from('event_sponsors').select('*', { count: 'exact', head: true }).eq('event_id', event.id)
    : { count: 0 }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event?.title ?? slug}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Sponsors</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Sponsors</h1>
        {count !== null && count > 0 && (
          <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{count} sponsors</span>
        )}
      </div>

      <div className="pz-card p-6">
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 16 }}>
          Manage event sponsors, tiers, and exhibitor directory. Sponsors can be displayed at{' '}
          <Link href={`/e/${slug}`} style={{ color: 'var(--pz-teal)' }}>the event page</Link>.
        </p>
        <p style={{ fontSize: 13, color: 'var(--pz-muted)' }}>
          Full sponsor management UI — Sprint 25.
        </p>
      </div>
    </div>
  )
}
