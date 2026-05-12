import { notFound } from 'next/navigation'
import { getEventBySlug } from '@/lib/events/actions'
import { EventStatusBadge } from '@/components/events/EventStatusBadge'
import { EventStatusActions } from '@/components/events/EventStatusActions'
import { AdminTileGrid } from '@/components/events/AdminTileGrid'
import { getAdminTileBadges } from '@/lib/events/admin-tile-counts'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

function fmt(iso: string, tz: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  // Admin client: fetch org slug for integration tile link + tile badges
  const admin = createAdminClient()
  const [orgRes, badges] = await Promise.all([
    admin.from('organizations').select('slug').eq('id', (event as any).org_id).maybeSingle(),
    getAdminTileBadges((event as any).id),
  ])
  const orgSlug = orgRes.data?.slug

  const notArrived = event.registration_count - event.checked_in_count

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <EventStatusBadge status={event.status} />
            <span className="text-xs text-[#64748B] capitalize">{event.event_type.replace('_', ' ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-[#F0F4F8]">{event.title}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {fmt(event.start_at, event.timezone)} → {fmt(event.end_at, event.timezone)}
          </p>
          {(event.venue_city || event.venue_name) && (
            <p className="text-sm text-[#94A3B8]">
              📍 {[event.venue_name, event.venue_city, event.venue_state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/e/${slug}`}
            target="_blank"
            className="rounded-lg border border-[#1E3A5F] px-4 py-2 text-sm font-medium text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6]/40 transition-colors"
          >
            Preview ↗
          </Link>
          <Link
            href={`/events/${slug}/settings`}
            className="rounded-lg border border-[#1E3A5F] px-4 py-2 text-sm font-medium text-[#94A3B8] hover:text-[#F0F4F8] hover:border-[#00BFA6]/40 transition-colors"
          >
            Settings
          </Link>
          <EventStatusActions eventId={event.id} currentStatus={event.status} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: 'Registered',     value: event.registration_count, color: 'text-[#F0F4F8]' },
          { label: 'Checked In',     value: event.checked_in_count,   color: 'text-[#00BFA6]' },
          { label: 'Not Arrived',    value: notArrived,               color: 'text-[#F59E0B]' },
          { label: 'Active Sessions',value: 0,                        color: 'text-[#F0F4F8]' },
        ].map((s) => (
          <div key={s.label} className="pz-card p-4">
            <p className="text-xs font-medium text-[#64748B] mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <div className="pz-stat-bar" />
          </div>
        ))}
      </div>

      {/* Module tile grid */}
      <AdminTileGrid eventSlug={slug} orgSlug={orgSlug ?? undefined} badges={badges} />
    </div>
  )
}
