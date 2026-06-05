// Central registry for all semantic category / status / type → color palettes.
// This file is allowlisted in eslint.config.mjs (library-hex: colors passed to
// style props, not Tailwind tokens — intentional palette values).

// ── Comms channel ─────────────────────────────────────────────────────────────
export const CHANNEL_COLORS: Record<string, string> = {
  email: '#0891b2',
  push: '#7c3aed',
  both: 'var(--pz-success)',
}

// ── Sponsor tier (full config for sponsors dashboard + portal) ─────────────────
export const SPONSOR_TIERS = [
  { value: 'title',  label: 'Title Sponsor',  color: '#7c3aed' },
  { value: 'gold',   label: 'Gold Sponsor',   color: '#d97706' },
  { value: 'silver', label: 'Silver Sponsor', color: '#6b7280' },
  { value: 'bronze', label: 'Bronze Sponsor', color: '#92400e' },
] as const

export const SPONSOR_TIER_COLORS: Record<string, string> = {
  title: '#7c3aed',
  gold: '#d97706',
  silver: '#6b7280',
  bronze: '#92400e',
}

// ── Session / track type ───────────────────────────────────────────────────────
export const SESSION_TYPE_COLORS: Record<string, string> = {
  keynote: '#7c3aed',
  talk: '#0891b2',
  workshop: '#d97706',
  panel: 'var(--pz-success)',
  break: '#6b7280',
  networking: '#db2777',
  other: '#64748b',
}

// ── Survey status ──────────────────────────────────────────────────────────────
export const SURVEY_STATUS_COLORS: Record<string, string> = {
  draft: '#6b7280',
  active: 'var(--pz-success)',
  closed: '#7c3aed',
}

// ── Org role — two distinct palettes (teal vs violet) ─────────────────────────
// Context display (account switcher / get-contexts): owner = teal
export const ORG_ROLE_COLORS_CONTEXT: Record<string, string> = {
  owner: '#2DD4BF',
  admin: '#60A5FA',
  staff: '#94A3B8',
}

// Badge display — MemberList (owner/admin/staff keys, bg + text shape)
export const ORG_ROLE_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  owner:  { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa' },
  admin:  { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
  staff:  { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8' },
}

// Badge display — me/page RoleBadge (org_* keys, label + color shape)
export const ORG_ROLE_BADGE_CONFIGS: Record<string, { label: string; color: string }> = {
  org_owner: { label: 'Owner', color: '#A78BFA' },
  org_admin: { label: 'Admin', color: '#60A5FA' },
  org_staff: { label: 'Staff', color: '#94A3B8' },
}

// ── Template surface ───────────────────────────────────────────────────────────
export const TEMPLATE_SURFACE_COLORS: Record<string, string> = {
  survey: '#3b82f6',
  badge: '#8b5cf6',
  event: 'var(--pz-teal)',
  announcement: 'var(--pz-warning-fill)',
  icebreaker: '#ec4899',
  trivia: 'var(--pz-error)',
  certificate: '#B8860B',
}

// ── Social / brand ─────────────────────────────────────────────────────────────
export const SOCIAL_BRAND_COLORS: Record<string, string> = {
  linkedin: '#0077B5',
  x: '#000',
  googleWallet: '#1a73e8',
}

// ── Attendee registration status ──────────────────────────────────────────────
export const ATTENDEE_STATUS_COLORS: Record<string, string> = {
  confirmed: '#2DD4BF',
  pending: 'var(--pz-warning-fill)',
  cancelled: 'var(--pz-error)',
  waitlisted: '#8B5CF6',
  refunded: '#6B7280',
}

// ── Trivia difficulty ──────────────────────────────────────────────────────────
export const TRIVIA_DIFF_COLORS: Record<string, string> = {
  easy: 'var(--pz-success)',
  medium: '#d97706',
  hard: 'var(--pz-error)',
}

// ── Volunteer ─────────────────────────────────────────────────────────────────
export const VOLUNTEER_STATUS_COLORS: Record<string, string> = {
  invited:    'var(--pz-muted)',
  confirmed:  '#0ea5e9',
  checked_in: 'var(--pz-success)',
  no_show:    'var(--pz-error)',
  declined:   'var(--pz-warning-fill)',
}

export const VOLUNTEER_ALERT_TYPE_COLORS: Record<string, string> = {
  urgent:   'var(--pz-error)',
  issue:    'var(--pz-warning-fill)',
  question: '#3B82F6',
  info:     'var(--pz-muted)',
}

export const VOLUNTEER_PORTAL_ALERT_TYPES = [
  { value: 'urgent',   label: 'Urgent',   color: 'var(--pz-error)' },
  { value: 'issue',    label: 'Issue',    color: 'var(--pz-warning-fill)' },
  { value: 'question', label: 'Question', color: '#3B82F6' },
  { value: 'info',     label: 'Info',     color: '#64748B' },
] as const

// ── Sponsor lead quality ───────────────────────────────────────────────────────
export const SPONSOR_QUALITY_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  hot:  { bg: 'var(--pz-error-bg)',    color: 'var(--pz-error)',        label: 'Hot' },
  warm: { bg: 'var(--pz-warning-bg)',  color: 'var(--pz-warning-fill)', label: 'Warm' },
  cold: { bg: '#3b82f622',             color: '#3b82f6',                label: 'Cold' },
}

// ── Integration status badge ───────────────────────────────────────────────────
export const INTEGRATION_STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  connected:            { label: 'Connected',    bg: 'var(--pz-teal)',         color: 'var(--pz-on-accent)' },
  available:            { label: 'Not connected', bg: 'var(--pz-border)',      color: 'var(--pz-muted)' },
  awaiting_credentials: { label: 'Needs setup',  bg: 'var(--pz-warning-fill)', color: 'var(--pz-on-accent)' },
  error:                { label: 'Error',         bg: 'var(--pz-error)',        color: 'var(--pz-surface)' },
}

// ── Admin dashboard stat card accents ─────────────────────────────────────────
export const ADMIN_STAT_COLORS: Record<string, string> = {
  totalEvents:   '#3B82F6',
  registrations: '#8B5CF6',
}
