import type { SideNavGroup, SideNavItem } from '@/components/ui/SideNav'
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart2,
  Bell,
  Brain,
  Building,
  CalendarDays,
  ClipboardList,
  Clock,
  HelpCircle,
  Image,
  LayoutDashboard,
  MapPin,
  Megaphone,
  MessageCircle,
  Mic,
  Network,
  Plug,
  ScanLine,
  ScrollText,
  Settings,
  Sparkles,
  Tag,
  Ticket,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react'

export function buildEventNav(slug: string, flags: { canTickets?: boolean } = {}): {
  pinnedTop: SideNavItem[]
  groups: SideNavGroup[]
  pinnedBottom: SideNavItem[]
} {
  const { canTickets = true } = flags
  const base = `/events/${slug}`

  const pinnedTop: SideNavItem[] = [
    { label: 'Overview', href: base, icon: LayoutDashboard, exact: true },
  ]

  const groups: SideNavGroup[] = [
    {
      id: 'people',
      label: 'People',
      icon: Users,
      items: [
        { label: 'Attendees',    href: `${base}/attendees`,    icon: Users },
        { label: 'Check-in',     href: `${base}/checkin`,      icon: ScanLine },
        ...(canTickets ? [{ label: 'Tickets', href: `${base}/tickets`, icon: Ticket }] : []),
        { label: 'Badges',       href: `${base}/badges`,       icon: Tag },
        { label: 'Certificates', href: `${base}/certificates`, icon: Award },
        { label: 'Volunteers',   href: `${base}/volunteers`,   icon: UserCheck },
      ],
    },
    {
      id: 'program',
      label: 'Program',
      icon: CalendarDays,
      items: [
        { label: 'Agenda',      href: `${base}/agenda`,      icon: CalendarDays },
        { label: 'Speakers',    href: `${base}/speakers`,    icon: Mic },
        { label: 'Run of show', href: `${base}/run-of-show`, icon: Clock },
      ],
    },
    {
      id: 'community',
      label: 'Community',
      icon: MessageCircle,
      items: [
        { label: 'Community feed', href: `${base}/community`,   icon: MessageCircle },
        { label: 'Networking',     href: `${base}/networking`,  icon: Network },
        { label: 'Icebreakers',    href: `${base}/icebreakers`, icon: Sparkles },
        { label: 'Trivia',         href: `${base}/trivia`,      icon: Brain },
        { label: 'Leaderboard',    href: `${base}/leaderboard`, icon: Trophy },
        { label: 'Passport',       href: `${base}/passport`,    icon: MapPin },
        { label: 'Photos',         href: `${base}/photos`,      icon: Image },
      ],
    },
    {
      id: 'communications',
      label: 'Communications',
      icon: Megaphone,
      items: [
        { label: 'Announcements', href: `${base}/announcements`, icon: Bell },
        { label: 'Surveys',       href: `${base}/surveys`,       icon: ClipboardList },
      ],
    },
    {
      // Becomes "Exhibitors & Sponsors" when the exhibitor feature ships
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
        { label: 'Event settings', href: `${base}/settings`,     icon: Settings },
        { label: 'Integrations',   href: `${base}/integrations`, icon: Plug },
        { label: 'Analytics',      href: `${base}/analytics`,    icon: BarChart2 },
        { label: 'Audit log',      href: `${base}/audit-log`,    icon: ScrollText },
        { label: 'Failed jobs',    href: `${base}/dead-letters`, icon: AlertTriangle },
      ],
    },
  ]

  const pinnedBottom: SideNavItem[] = [
    { label: 'Help',           href: '/help',   icon: HelpCircle },
    { label: 'Back to events', href: '/events', icon: ArrowLeft },
  ]

  return { pinnedTop, groups, pinnedBottom }
}
