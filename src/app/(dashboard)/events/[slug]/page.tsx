import { notFound } from 'next/navigation'
import { getEventBySlug } from '@/lib/events/actions'
import { EventStatusBadge } from '@/components/events/EventStatusBadge'
import { EventStatusActions } from '@/components/events/EventStatusActions'
import { AdminTileGrid } from '@/components/events/AdminTileGrid'
import { SaveAsTemplateButton } from '@/components/events/SaveAsTemplateButton'
import { getAdminTileBadges } from '@/lib/events/admin-tile-counts'
import { getEventCounts } from '@/lib/registrations/counts'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { StaffDashboard } from './staff-dashboard'
import Link from 'next/link'

type Props = { params: Promise<{ slug: string }> }

const TIMEZONE_MAP: Record<string, string> = {
  'Eastern (ET)':  'America/New_York',
  'Central (CT)':  'America/Chicago',
  'Mountain (MT)': 'America/Denver',
  'Pacific (PT)':  'America/Los_Angeles',
  'Alaska (AKT)':  'America/Anchorage',
  'Hawaii (HT)':   'Pacific/Honolulu',
}

function fmt(iso: string, tz: string) {
  const ianaZone = TIMEZONE_MAP[tz] ?? tz
  return new Date(iso).toLocaleString('en-US', {
    timeZone: ianaZone,
    weekday: 'short', month: 'short', day: 'numeric',
    year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params
  const event = await getEventBySlug(slug)
  if (!event) notFound()

  const supabase = await createClient()
  const user = await requireUser()

  const { data: memberRow } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const userRole = memberRow?.role ?? null

  // Admin client: fetch org slug for integration tile link + tile badges + live counts
  const admin = createAdminClient()
  const [orgRes, badges, counts] = await Promise.all([
    admin.from('organizations').select('slug').eq('id', (event as any).org_id).maybeSingle(),
    getAdminTileBadges((event as any).id),
    getEventCounts((event as any).id),
  ])
  const orgSlug = orgRes.data?.slug

  if (userRole === 'staff') {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const todayEnd   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()

    const [todaysSessionsRes, currentCueRes] = await Promise.all([
      supabase
        .from('sessions')
        .select('id, title, starts_at, ends_at, rooms(name)')
        .eq('event_id', (event as any).id)
        .gte('starts_at', todayStart)
        .lt('starts_at', todayEnd)
        .order('starts_at', { ascending: true }),
      supabase
        .from('run_of_show_items')
        .select('id, title, time_at, duration_minutes, responsible_person, status')
        .eq('event_id', (event as any).id)
        .in('status', ['in_progress', 'upcoming'])
        .order('time_at', { ascending: true })
        .limit(5),
    ])

    const rosItems = (currentCueRes.data ?? []) as any[]
    const currentCue = rosItems.find((i: any) => i.status === 'in_progress') ?? null
    const nextCue = rosItems.find((i: any) => i.status === 'upcoming') ?? null

    return (
      <StaffDashboard
        event={{ slug: event.slug, title: event.title, timezone: (event as any).timezone }}
        checkedInCount={counts.checkedIn}
        registrationCount={counts.total}
        todaysSessions={(todaysSessionsRes.data ?? []) as any}
        currentCue={currentCue}
        nextCue={nextCue}
      />
    )
  }

  const notArrived = counts.confirmed - counts.checkedIn

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
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <SaveAsTemplateButton eventId={event.id} defaultName={event.title} />
          {(event as any).lobby_token && (
            <a
              href={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/lobby/${(event as any).lobby_token}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--pz-muted)', textDecoration: 'none',
                       border: '1px solid var(--pz-border)', borderRadius: 6, padding: '4px 10px' }}
            >
              📺 Lobby display
            </a>
          )}
          {(event as any).mc_token && (
            <a
              href={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'}/mc/${(event as any).mc_token}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: 'var(--pz-muted)', textDecoration: 'none',
                       border: '1px solid var(--pz-border)', borderRadius: 6, padding: '4px 10px' }}
            >
              🎙️ MC hub
            </a>
          )}
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
          { label: 'Confirmed',   value: counts.confirmed,  color: 'text-[#F0F4F8]' },
          { label: 'Checked In',  value: counts.checkedIn,  color: 'text-[#00BFA6]' },
          { label: 'Not Arrived', value: notArrived,        color: 'text-[#F59E0B]' },
          { label: 'Total Regs',  value: counts.total,      color: 'text-[#F0F4F8]' },
        ].map((s) => (
          <div key={s.label} className="pz-card p-4">
            <p className="text-xs font-medium text-[#64748B] mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <div className="pz-stat-bar" />
          </div>
        ))}
      </div>

      {/* Module tile grid */}
      <AdminTileGrid eventSlug={slug} orgSlug={orgSlug ?? undefined} badges={badges} userRole={userRole} />
    </div>
  )
}
