import type { ComponentType, CSSProperties } from 'react'
import {
  Award,
  BarChart2,
  Bell,
  Brain,
  Building,
  CalendarDays,
  Clock,
  Image,
  LayoutDashboard,
  MapPin,
  Mic,
  Network,
  RefreshCw,
  ScanLine,
  Settings,
  Sparkles,
  Tag,
  Ticket,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react'

type Icon = ComponentType<{ size?: number; style?: CSSProperties; className?: string }>

export interface EmbedNavItem {
  label: string
  href: string
  icon: Icon
  external?: boolean
  built?: boolean
}

export interface EmbedNavGroup {
  id: string
  label: string
  icon: Icon
  items: EmbedNavItem[]
}

export { LayoutDashboard as EmbedOverviewIcon }

export function buildEmbedEventNav(eventId: string, ghlLocationId?: string): {
  overviewHref: string
  groups: EmbedNavGroup[]
} {
  const base = `/embedded/events/${eventId}`

  return {
    overviewHref: base,
    groups: [
      {
        id: 'people',
        label: 'People',
        icon: Users,
        items: [
          { label: 'Attendees',    href: `${base}/attendees`,    icon: Users,     built: true },
          { label: 'Check-in',     href: `${base}/checkin`,      icon: ScanLine,  built: true },
          {
            label: 'Tickets',
            href: ghlLocationId
              ? `https://app.gohighlevel.com/v2/location/${ghlLocationId}/payments/products`
              : `${base}/tickets`,
            icon: Ticket,
            external: true,
            built: Boolean(ghlLocationId), // available external destination when we have the location;
                                           // falls back to disabled (not a clickable 404) if ever missing
            // GHL app host hardcoded for the 4S account; white-label/custom-domain sub-accounts are a GE-8 concern.
          },
          { label: 'Badges',       href: `${base}/badges`,       icon: Tag,       built: true },
          { label: 'Certificates', href: `${base}/certificates`, icon: Award,     built: true },
          { label: 'Volunteers',   href: `${base}/volunteers`,   icon: UserCheck },
        ],
      },
      {
        id: 'program',
        label: 'Program',
        icon: CalendarDays,
        items: [
          { label: 'Agenda',      href: `${base}/agenda`,      icon: CalendarDays, built: true },
          { label: 'Speakers',    href: `${base}/speakers`,    icon: Mic,         built: true },
          { label: 'Run of show', href: `${base}/run-of-show`, icon: Clock, built: true },
        ],
      },
      {
        id: 'engagement',
        label: 'Engagement',
        icon: Sparkles,
        items: [
          { label: 'Networking',    href: `${base}/networking`,    icon: Network, built: true },
          { label: 'Icebreakers',   href: `${base}/icebreakers`,   icon: Sparkles, built: true },
          { label: 'Trivia',        href: `${base}/trivia`,        icon: Brain, built: true },
          { label: 'Leaderboard',   href: `${base}/leaderboard`,   icon: Trophy, built: true },
          { label: 'Passport',      href: `${base}/passport`,      icon: MapPin, built: true },
          { label: 'Announcements', href: `${base}/announcements`, icon: Bell },
          { label: 'Photos',        href: `${base}/photos`,        icon: Image, built: true },
        ],
      },
      {
        id: 'sponsors',
        label: 'Sponsors',
        icon: Building,
        items: [
          { label: 'Sponsors', href: `${base}/sponsors`, icon: Building },
        ],
      },
      {
        id: 'admin',
        label: 'Admin',
        icon: BarChart2,
        items: [
          { label: 'Event settings', href: `${base}/settings`,    icon: Settings, built: true },
          { label: 'Analytics',      href: `${base}/analytics`,   icon: BarChart2, built: true },
          { label: 'Sync health',    href: `${base}/sync-health`, icon: RefreshCw },
        ],
      },
    ],
  }
}
