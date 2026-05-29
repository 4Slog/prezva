import { requireEventOrgAccess } from '@/lib/auth/require-event-access'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

export default async function EventPhotosAdminPage({ params }: Props) {
  const { slug } = await params
  const { event } = await requireEventOrgAccess(slug)
  const admin = createAdminClient()
  const { count } = await admin.from('community_photos').select('*', { count: 'exact', head: true }).eq('event_id', event.id)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href={`/events/${slug}`} style={{ color: 'var(--pz-teal)', fontSize: 13, textDecoration: 'none' }}>
          ← {event.title}
        </Link>
        <span style={{ color: 'var(--pz-border)' }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--pz-text)' }}>Photos</span>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#F0F4F8]">Event Photos</h1>
        <span style={{ fontSize: 13, color: 'var(--pz-muted)' }}>{count ?? 0} total</span>
      </div>

      <div className="pz-card p-6">
        <p style={{ fontSize: 14, color: 'var(--pz-muted)', marginBottom: 16 }}>
          Attendees can upload photos from the event app. Photos appear in the public gallery at{' '}
          <Link href={`/e/${slug}/photos`} style={{ color: 'var(--pz-teal)' }}>prezva.app/e/{slug}/photos</Link>.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link
            href={`/e/${slug}/photos`}
            target="_blank"
            style={{ padding: '8px 16px', background: 'var(--pz-teal)', color: '#0D1B2A', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
          >
            View public gallery ↗
          </Link>
        </div>
      </div>
    </div>
  )
}
