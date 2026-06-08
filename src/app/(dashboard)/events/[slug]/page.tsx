import { notFound } from 'next/navigation'
import { getEventBySlug } from '@/lib/events/actions'
import { EventStatusBadge } from '@/components/events/EventStatusBadge'
import { EventStatusActions } from '@/components/events/EventStatusActions'
import { AdminTileGrid } from '@/components/events/AdminTileGrid'
import { EventGroupCard } from '@/components/events/EventGroupCard'
import { SaveAsTemplateButton } from '@/components/events/SaveAsTemplateButton'
import { getAdminTileBadges } from '@/lib/events/admin-tile-counts'
import { getEventCounts } from '@/lib/registrations/counts'
import { getGroupSummaryStats } from '@/lib/events/group-summary-stats'
import { ADMIN_TILES } from '@/lib/events/admin-tiles'
import type { TileCategory } from '@/lib/events/admin-tiles'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { getOrgPermissions } from '@/lib/auth/assert-permission'
import { StaffDashboard } from './staff-dashboard'
import Link from 'next/link'
import {
  Users, CalendarDays, MessageCircle, Megaphone, Building, BarChart2, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'

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
  const [orgRes, badges, counts, groupStats] = await Promise.all([
    admin.from('organizations').select('slug').eq('id', (event as any).org_id).maybeSingle(),
    getAdminTileBadges((event as any).id),
    getEventCounts((event as any).id),
    getGroupSummaryStats((event as any).id),
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

  const permSet = await getOrgPermissions((event as any).org_id, user.id)
  const permissions = Array.from(permSet)

  const notArrived = counts.confirmed - counts.checkedIn

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <EventStatusBadge status={event.status} />
            <span className="text-xs text-[var(--pz-muted)] capitalize">{event.event_type.replace('_', ' ')}</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--pz-text)]">{event.title}</h1>
          <p className="text-sm text-[var(--pz-muted)] mt-1">
            {fmt(event.start_at, event.timezone)} → {fmt(event.end_at, event.timezone)}
          </p>
          {(event.venue_city || event.venue_name) && (
            <p className="text-sm text-[var(--pz-muted)]">
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
            className="rounded-lg border border-[var(--pz-border)] px-4 py-2 text-sm font-medium text-[var(--pz-muted)] hover:text-[var(--pz-text)] hover:border-[var(--pz-teal)] transition-colors"
          >
            Preview ↗
          </Link>
          <Link
            href={`/events/${slug}/settings`}
            className="rounded-lg border border-[var(--pz-border)] px-4 py-2 text-sm font-medium text-[var(--pz-muted)] hover:text-[var(--pz-text)] hover:border-[var(--pz-teal)] transition-colors"
          >
            Settings
          </Link>
          <EventStatusActions eventId={event.id} currentStatus={event.status} />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-8">
        {[
          { label: 'Confirmed',   value: counts.confirmed,  color: 'text-[var(--pz-text)]' },
          { label: 'Checked In',  value: counts.checkedIn,  color: 'text-[var(--pz-teal-ink)]' },
          { label: 'Not Arrived', value: notArrived,        color: 'text-[var(--pz-warning)]' },
          { label: 'Total Regs',  value: counts.total,      color: 'text-[var(--pz-text)]' },
        ].map((s) => (
          <div key={s.label} className="pz-card p-4">
            <p className="text-xs font-medium text-[var(--pz-muted)] mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            {s.value > 0 && <div className="pz-stat-bar" />}
          </div>
        ))}
      </div>

      {/* Group summary cards — one per nav group, hero stat, taps to primary destination */}
      {(() => {
        const allowed = (key: string) => permSet.has('*') || permSet.has(key)
        const GROUP_CARDS: {
          key: TileCategory; label: string; icon: LucideIcon
          stat: string; statLabel: string; href: string; isAlert?: boolean
        }[] = [
          {
            key: 'people',
            label: 'People',
            icon: Users,
            stat: `${counts.checkedIn} / ${counts.total}`,
            statLabel: 'checked in',
            href: `/events/${slug}/attendees`,
          },
          {
            key: 'program',
            label: 'Program',
            icon: CalendarDays,
            stat: `${groupStats.sessions}`,
            statLabel: groupStats.sessions === 1 ? 'session' : 'sessions',
            href: `/events/${slug}/agenda`,
          },
          {
            key: 'community',
            label: 'Community',
            icon: MessageCircle,
            stat: `${groupStats.communityPosts}`,
            statLabel: groupStats.communityPosts === 1 ? 'post' : 'posts',
            href: `/events/${slug}/community`,
          },
          {
            key: 'communications',
            label: 'Communications',
            icon: Megaphone,
            stat: `${groupStats.announcementsSent}`,
            statLabel: 'sent',
            href: `/events/${slug}/announcements`,
          },
          {
            key: 'sponsors',
            label: 'Sponsors',
            icon: Building,
            stat: `${groupStats.sponsors}`,
            statLabel: groupStats.sponsors === 1 ? 'sponsor' : 'sponsors',
            href: `/events/${slug}/sponsors`,
          },
          {
            key: 'admin',
            label: 'Admin',
            icon: groupStats.failedJobs > 0 ? AlertTriangle : BarChart2,
            stat: groupStats.failedJobs > 0 ? `${groupStats.failedJobs}` : '—',
            statLabel: groupStats.failedJobs > 0 ? 'need attention' : 'All systems normal',
            href: `/events/${slug}/analytics`,
            isAlert: groupStats.failedJobs > 0,
          },
        ]
        const visible = GROUP_CARDS.filter(g =>
          ADMIN_TILES.some(t => t.category === g.key && allowed(t.permission))
        )
        if (visible.length === 0) return null
        return (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 mb-8">
            {visible.map(({ key: gk, ...cardProps }) => (
              <EventGroupCard key={gk} {...cardProps} />
            ))}
          </div>
        )
      })()}

      {/* Module tile grid */}
      <AdminTileGrid eventSlug={slug} orgSlug={orgSlug ?? undefined} badges={badges} permissions={permissions} />
    </div>
  )
}
