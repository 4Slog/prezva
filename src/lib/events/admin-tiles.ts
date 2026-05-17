export type TileCategory = 'core' | 'engagement' | 'advanced' | 'integration'

export interface AdminTile {
  key: string
  label: string
  icon: string
  category: TileCategory
  description: string
  href: (slug: string) => string
}

export const ADMIN_TILES: AdminTile[] = [
  // Core
  { key: 'attendees',      label: 'Attendees',      icon: '👥', category: 'core',        description: 'Manage registrations, check-ins, refunds',           href: s => `/events/${s}/attendees` },
  { key: 'tickets',        label: 'Tickets',         icon: '🎟️', category: 'core',        description: 'Ticket types, pricing, capacity, discount codes',    href: s => `/events/${s}/tickets` },
  { key: 'agenda',         label: 'Agenda',          icon: '📋', category: 'core',        description: 'Sessions, schedule, session documents, check-ins',   href: s => `/events/${s}/agenda` },
  { key: 'speakers',       label: 'Speakers',        icon: '🎤', category: 'core',        description: 'Invite speakers, manage bios, handouts, portal',     href: s => `/events/${s}/speakers` },
  { key: 'checkin',        label: 'Check-in',        icon: '✅', category: 'core',        description: 'QR scanner, kiosk mode, walk-in registrations',      href: s => `/events/${s}/checkin` },
  { key: 'volunteers',     label: 'Volunteers',      icon: '🙋', category: 'core',        description: 'Manage event volunteers, shifts, and check-in access', href: s => `/events/${s}/volunteers` },
  { key: 'badges',         label: 'Badges',          icon: '🏷️', category: 'core',        description: 'Design and print attendee name badges',              href: s => `/events/${s}/badges` },

  // Engagement
  { key: 'announcements',  label: 'Announcements',   icon: '📣', category: 'engagement',  description: 'Send email and push notifications to attendees',     href: s => `/events/${s}/announcements` },
  { key: 'surveys',        label: 'Surveys',         icon: '📊', category: 'engagement',  description: 'Post-event feedback, session ratings, NPS surveys',  href: s => `/events/${s}/surveys` },
  { key: 'networking',     label: 'Networking',      icon: '🤝', category: 'engagement',  description: 'AI matchmaking, connection requests, speed networking', href: s => `/events/${s}/networking` },
  { key: 'community',      label: 'Community Feed',  icon: '💬', category: 'engagement',  description: 'Event social feed, posts, likes, moderation',        href: s => `/events/${s}/community` },
  { key: 'photos',         label: 'Photos',          icon: '📸', category: 'engagement',  description: 'Attendee photo gallery and media uploads',           href: s => `/events/${s}/photos` },
  { key: 'leaderboard',    label: 'Leaderboard',     icon: '🏆', category: 'engagement',  description: 'Gamification points, badges, and rankings',          href: s => `/events/${s}/leaderboard` },
  { key: 'icebreakers',    label: 'Icebreakers',     icon: '🧊', category: 'engagement',  description: 'Conversation starters and group activities',         href: s => `/events/${s}/icebreakers` },
  { key: 'trivia',         label: 'Trivia',          icon: '🧠', category: 'engagement',  description: 'Live trivia game with scoring and leaderboard',      href: s => `/events/${s}/trivia` },
  { key: 'passport',       label: 'Passport',        icon: '📍', category: 'engagement',  description: 'Booth passport game — locations, codes, analytics',  href: s => `/events/${s}/passport` },

  // Advanced
  { key: 'sponsors',       label: 'Sponsors',        icon: '🏢', category: 'advanced',    description: 'Sponsor tiers, logos, exhibitor directory',         href: s => `/events/${s}/sponsors` },
  { key: 'certificates',   label: 'Certificates',    icon: '🎓', category: 'advanced',    description: 'CE certificates, eligibility rules, email delivery', href: s => `/events/${s}/certificates` },
  { key: 'analytics',      label: 'Analytics',       icon: '📈', category: 'advanced',    description: 'Registration trends, engagement, survey results',    href: s => `/events/${s}/analytics` },
  { key: 'audit-log',      label: 'Audit Log',       icon: '🔍', category: 'advanced',    description: 'Track all admin actions, exports, and changes',      href: s => `/events/${s}/audit-log` },
  { key: 'dead-letters',   label: 'Failed Jobs',     icon: '⚠️', category: 'advanced',    description: 'View and replay failed background sync jobs',        href: s => `/events/${s}/dead-letters` },

  // Integration
  { key: 'integrations',   label: 'Integrations',    icon: '🔌', category: 'integration', description: 'Zoom, Mailchimp, Google Drive, AMS, and 12+ more',   href: s => `/events/${s}/integrations` },
]

export const TILE_CATEGORIES: { key: TileCategory; label: string }[] = [
  { key: 'core',        label: 'Core' },
  { key: 'engagement',  label: 'Engagement' },
  { key: 'advanced',    label: 'Advanced' },
  { key: 'integration', label: 'Integrations' },
]

export function getTilesByCategory(category: TileCategory): AdminTile[] {
  return ADMIN_TILES.filter(t => t.category === category)
}
