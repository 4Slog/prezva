import {
  Users, ScanLine, Ticket, Tag, Award, UserCheck,
  CalendarDays, Mic, Clock,
  MessageCircle, Network, MessagesSquare, Brain, Trophy, MapPin, Image,
  Megaphone, ClipboardList,
  Building,
  BarChart2, ScrollText, AlertTriangle, Plug,
  type LucideIcon,
} from 'lucide-react'

export type TileCategory = 'people' | 'program' | 'community' | 'communications' | 'sponsors' | 'admin'

export interface AdminTile {
  key: string
  label: string
  icon: LucideIcon
  category: TileCategory
  description: string
  href: (slug: string) => string
  permission: string
}

export const ADMIN_TILES: AdminTile[] = [
  // People
  { key: 'attendees',    label: 'Attendees',     icon: Users,         category: 'people',         permission: 'attendees.view',        description: 'Manage registrations, check-ins, refunds',             href: s => `/events/${s}/attendees` },
  { key: 'checkin',      label: 'Check-in',       icon: ScanLine,      category: 'people',         permission: 'checkin.manage',        description: 'QR scanner, kiosk mode, walk-in registrations',        href: s => `/events/${s}/checkin` },
  { key: 'tickets',      label: 'Tickets',        icon: Ticket,        category: 'people',         permission: 'event.tickets',         description: 'Ticket types, pricing, capacity, discount codes',      href: s => `/events/${s}/tickets` },
  { key: 'badges',       label: 'Badges',         icon: Tag,           category: 'people',         permission: 'badges.manage',         description: 'Design and print attendee name badges',                href: s => `/events/${s}/badges` },
  { key: 'certificates', label: 'Certificates',   icon: Award,         category: 'people',         permission: 'certificates.manage',   description: 'CE certificates, eligibility rules, email delivery',   href: s => `/events/${s}/certificates` },
  { key: 'volunteers',   label: 'Volunteers',     icon: UserCheck,     category: 'people',         permission: 'volunteers.manage',     description: 'Manage event volunteers, shifts, and check-in access', href: s => `/events/${s}/volunteers` },

  // Program — Agenda and Run of Show each get their own icon (📋 dup resolved)
  { key: 'agenda',       label: 'Agenda',         icon: CalendarDays,  category: 'program',        permission: 'agenda.view',           description: 'Sessions, schedule, session documents, check-ins',     href: s => `/events/${s}/agenda` },
  { key: 'speakers',     label: 'Speakers',       icon: Mic,           category: 'program',        permission: 'speakers.view',         description: 'Invite speakers, manage bios, handouts, portal',       href: s => `/events/${s}/speakers` },
  { key: 'run-of-show',  label: 'Run of Show',    icon: Clock,         category: 'program',        permission: 'run_of_show.view',      description: 'Day-of timeline, cue notifications, status tracking',  href: s => `/events/${s}/run-of-show` },

  // Community
  { key: 'community',    label: 'Community Feed', icon: MessageCircle, category: 'community',      permission: 'community.manage',      description: 'Event social feed, posts, likes, moderation',          href: s => `/events/${s}/community` },
  { key: 'networking',   label: 'Networking',     icon: Network,       category: 'community',      permission: 'networking.view',       description: 'AI matchmaking, connection requests, speed networking', href: s => `/events/${s}/networking` },
  { key: 'icebreakers',  label: 'Icebreakers',    icon: MessagesSquare, category: 'community',      permission: 'icebreakers.manage',    description: 'Conversation starters and group activities',           href: s => `/events/${s}/icebreakers` },
  { key: 'trivia',       label: 'Trivia',         icon: Brain,         category: 'community',      permission: 'trivia.manage',         description: 'Live trivia game with scoring and leaderboard',         href: s => `/events/${s}/trivia` },
  { key: 'leaderboard',  label: 'Leaderboard',    icon: Trophy,        category: 'community',      permission: 'leaderboard.view',      description: 'Gamification points, badges, and rankings',             href: s => `/events/${s}/leaderboard` },
  { key: 'passport',     label: 'Passport',       icon: MapPin,        category: 'community',      permission: 'passport.manage',       description: 'Booth visits & stamps — attendees scan booth codes to collect check-ins', href: s => `/events/${s}/passport` },
  { key: 'photos',       label: 'Photos',         icon: Image,         category: 'community',      permission: 'photos.manage',         description: 'Attendee photo gallery and media uploads',              href: s => `/events/${s}/photos` },

  // Communications
  { key: 'announcements', label: 'Announcements', icon: Megaphone,     category: 'communications', permission: 'announcements.manage',  description: 'Send email and push notifications to attendees',       href: s => `/events/${s}/announcements` },
  { key: 'surveys',       label: 'Surveys',        icon: ClipboardList, category: 'communications', permission: 'surveys.view',          description: 'Post-event feedback, session ratings, NPS surveys',    href: s => `/events/${s}/surveys` },

  // Sponsors — becomes "Exhibitors & Sponsors" when the exhibitor feature ships
  { key: 'sponsors',      label: 'Sponsors',       icon: Building,      category: 'sponsors',       permission: 'sponsors.view',         description: 'Sponsor tiers, logos, exhibitor directory',            href: s => `/events/${s}/sponsors` },

  // Admin
  { key: 'analytics',    label: 'Analytics',      icon: BarChart2,     category: 'admin',          permission: 'analytics.view',        description: 'Registration trends, engagement, survey results',      href: s => `/events/${s}/analytics` },
  { key: 'audit-log',    label: 'Audit Log',      icon: ScrollText,    category: 'admin',          permission: 'event.audit_log',       description: 'Track all admin actions, exports, and changes',        href: s => `/events/${s}/audit-log` },
  { key: 'dead-letters',  label: 'Failed Jobs',    icon: AlertTriangle, category: 'admin',          permission: 'failed_jobs.manage',    description: 'View and retry failed background jobs and emails',     href: s => `/events/${s}/dead-letters` },
  { key: 'integrations',  label: 'Integrations',   icon: Plug,          category: 'admin',          permission: 'event.integrations',    description: 'Zoom, Mailchimp, Google Drive, AMS, and 12+ more',    href: s => `/events/${s}/integrations` },
]

export const TILE_CATEGORIES: { key: TileCategory; label: string }[] = [
  { key: 'people',         label: 'People' },
  { key: 'program',        label: 'Program' },
  { key: 'community',      label: 'Community' },
  { key: 'communications', label: 'Communications' },
  { key: 'sponsors',       label: 'Sponsors' },
  { key: 'admin',          label: 'Admin' },
]

export function getTilesByCategory(category: TileCategory): AdminTile[] {
  return ADMIN_TILES.filter(t => t.category === category)
}
