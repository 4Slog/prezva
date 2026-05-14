export type TemplateSurface = 'survey' | 'badge' | 'event' | 'announcement' | 'icebreaker' | 'trivia'

export interface SurveyQuestion {
  type: 'nps' | 'rating' | 'multi_choice' | 'short_text' | 'long_text' | 'boolean' | 'number'
  label: string
  options?: string[] | string
  multi?: boolean
  required?: boolean
  scale?: number
}

export interface SurveyTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  duration_estimate_seconds?: number
  audience?: string
  questions: SurveyQuestion[]
}

export interface BadgeField {
  type: 'text' | 'image' | 'qr'
  binding?: string
  static?: string
  x: number
  y: number
  w: number
  h: number
  font_size?: number
  weight?: string
  align?: string
  color?: string
  shape?: string
  wrap?: boolean
}

export interface BadgeTemplate {
  id: string
  name: string
  description: string
  layout: 'portrait' | 'landscape'
  size: { width_mm: number; height_mm: number }
  fields: BadgeField[]
  accent_color?: string
  accent_color_var?: string
}

export interface TicketTypeTemplate {
  name: string
  type: 'free' | 'paid'
  price_cents: number
  quantity: number
  description?: string
  membership_required?: boolean
}

export interface SessionTemplate {
  day: number
  hours_offset: number
  duration: number
  type: string
  title: string
  recurrence?: string
}

export interface EventTemplate {
  id: string
  name: string
  description: string
  tags: string[]
  duration_days: number
  capacity_default: number
  is_virtual?: boolean
  is_hybrid?: boolean
  hybrid_capacity_default?: number
  ticket_types: TicketTypeTemplate[]
  sessions?: SessionTemplate[]
  tracks?: { name: string; color: string }[]
  starter_announcements?: string[]
  starter_survey?: string
  leaderboard_enabled?: boolean
  icebreakers_enabled?: boolean
  passport_enabled?: boolean
  sponsor_tiers_enabled?: string[]
  ce_credits_enabled?: boolean
  member_gating?: boolean
  fundraising_enabled?: boolean
}

export interface AnnouncementTemplate {
  id: string
  name: string
  description: string
  channels: string[]
  audience: string
  subject: string
  subjects?: string[]
  body: string
  trigger?: string
}

export interface IcebreakerPrompt {
  id: string
  text: string
  tags: string[]
}

export interface TriviaQuestion {
  id: string
  category: string
  q: string
  options: string[]
  correct: number
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface OrgTemplate {
  id: string
  org_id: string
  surface: TemplateSurface
  name: string
  description?: string
  payload: Record<string, unknown>
  created_by?: string
  created_at: string
  updated_at: string
  usage_count: number
}
