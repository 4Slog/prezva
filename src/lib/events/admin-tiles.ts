export type TileCategory = 'core' | 'engagement' | 'advanced' | 'integration'

export interface AdminTile {
  key: string
  label: string
  icon: string
  category: TileCategory
  description: string
  href: (slug: string) => string
  permission: string
}

export const ADMIN_TILES: AdminTile[] = [
  // Core
  { key: 'attendees',    label: 'Attendees',     icon: '👥', category: 'core',        permission: 'attendees.view',        description: 'Manage registrations, check-ins, refunds',            href: s => `/events/${s}/attendees` },
  { key: 'tickets',      label: 'Tickets',        icon: '🎟️', category: 'core',        permission: 'event.tickets',         description: 'Ticket types, pricing, capacity, discount codes',     href: s => `/events/${s}/tickets` },
  { key: 'agenda',       label: 'Agenda',         icon: '📋', category: 'core',        permission: 'agenda.view',           description: 'Sessions, schedule, session documents, check-ins',    href: s => `/events/${s}/agenda` },
  { key: 'speakers',     label: 'Speakers',       icon: '🎤', category: 'core',        permission: 'speakers.view',         description: 'Invite speakers, manage bios, handouts, portal',      href: s => `/events/${s}/speakers` },
  { key: 'checkin',      label: 'Check-in',       icon: '✅', category: 'core',        permission: 'checkin.manage',        description: 'QR scanner, kiosk mode, walk-in registrations',       href: s => `/events/${s}/checkin` },
  { key: 'volunteers',   label: 'Volunteers',     icon: '🙋', category: 'core',        permission: 'volunteers.manage',     description: 'Manage event volunteers, shifts, and check-in access', href: s => `/events/${s}/volunteers` },
  { key: 'badges',       label: 'Badges',         icon: '🏷️', category: 'core',        permission: 'badges.manage',         description: 'Design and print attendee name badges',               href: s => `/events/${s}/badges` },

  // Engagement
  { key: 'announcements', label: 'Announcements', icon: '📣', category: 'engagement',  permission: 'announcements.manage',  description: 'Send email and push notifications to attendees',      href: s => `/events/${s}/announcements` },
  { key: 'surveys',      label: 'Surveys',        icon: '📊', category: 'engagement',  permission: 'surveys.view',          description: 'Post-event feedback, session ratings, NPS surveys',   href: s => `/events/${s}/surveys` },
  { key: 'networking',   label: 'Networking',     icon: '🤝', category: 'engagement',  permission: 'networking.view',       description: 'AI matchmaking, connection requests, speed networking', href: s => `/events/${s}/networking` },
  { key: 'community',    label: 'Community Feed', icon: '💬', category: 'engagement',  permission: 'community.manage',      description: 'Event social feed, posts, likes, moderation',         href: s => `/events/${s}/community` },
  { key: 'photos',       label: 'Photos',         icon: '📸', category: 'engagement',  permission: 'photos.manage',         description: 'Attendee photo gallery and media uploads',             href: s => `/events/${s}/photos` },
  { key: 'leaderboard',  label: 'Leaderboard',   icon: '🏆', category: 'engagement',  permission: 'leaderboard.view',      description: 'Gamification points, badges, and rankings',            href: s => `/events/${s}/leaderboard` },
  { key: 'icebreakers',  label: 'Icebreakers',   icon: '🧊', category: 'engagement',  permission: 'icebreakers.manage',    description: 'Conversation starters and group activities',          href: s => `/events/${s}/icebreakers` },
  { key: 'trivia',       label: 'Trivia',         icon: '🧠', category: 'engagement',  permission: 'trivia.manage',         description: 'Live trivia game with scoring and leaderboard',        href: s => `/events/${s}/trivia` },
  { key: 'passport',     label: 'Passport',       icon: '📍', category: 'engagement',  permission: 'passport.manage',       description: 'Booth passport game — locations, codes, analytics',   href: s => `/events/${s}/passport` },

  // Advanced
  { key: 'sponsors',     label: 'Sponsors',       icon: '🏢', category: 'advanced',    permission: 'sponsors.view',         description: 'Sponsor tiers, logos, exhibitor directory',           href: s => `/events/${s}/sponsors` },
  { key: 'certificates', label: 'Certificates',   icon: '🎓', category: 'advanced',    permission: 'certificates.manage',   description: 'CE certificates, eligibility rules, email delivery',  href: s => `/events/${s}/certificates` },
  { key: 'analytics',   label: 'Analytics',      icon: '📈', category: 'advanced',    permission: 'analytics.view',        description: 'Registration trends, engagement, survey results',     href: s => `/events/${s}/analytics` },
  { key: 'audit-log',   label: 'Audit Log',      icon: '🔍', category: 'advanced',    permission: 'event.audit_log',       description: 'Track all admin actions, exports, and changes',       href: s => `/events/${s}/audit-log` },
  { key: 'dead-letters', label: 'Failed Jobs',   icon: '⚠️', category: 'advanced',    permission: 'failed_jobs.manage',    description: 'View and retry failed background jobs and emails',    href: s => `/events/${s}/dead-letters` },
  { key: 'run-of-show', label: 'Run of Show',    icon: '📋', category: 'advanced',    permission: 'run_of_show.view',      description: 'Day-of timeline, cue notifications, status tracking', href: s => `/events/${s}/run-of-show` },

  // Integration
  { key: 'integrations', label: 'Integrations',  icon: '🔌', category: 'integration', permission: 'event.integrations',    description: 'Zoom, Mailchimp, Google Drive, AMS, and 12+ more',   href: s => `/events/${s}/integrations` },
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
