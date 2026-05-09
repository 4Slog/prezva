export type OrgRole = 'owner' | 'admin' | 'staff'
export type EventStatus = 'draft' | 'published' | 'live' | 'ended' | 'archived' | 'cancelled'
export type EventType = 'in_person' | 'virtual' | 'hybrid'
export type TicketType = 'free' | 'paid' | 'donation'
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled' | 'waitlisted' | 'refunded'
export type CheckinMethod = 'qr_scan' | 'manual' | 'kiosk' | 'self'
export type SessionType = 'talk' | 'workshop' | 'panel' | 'keynote' | 'break' | 'networking' | 'other'
export type SurveyStatus = 'draft' | 'active' | 'closed'
export type MessageStatus = 'sent' | 'delivered' | 'read'
export type AnnouncementChannel = 'email' | 'push' | 'both'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  bio: string | null
  job_title: string | null
  company: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  timezone: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Event {
  id: string
  org_id: string
  created_by: string
  title: string
  slug: string
  description: string | null
  status: EventStatus
  event_type: EventType
  timezone: string
  start_at: string
  end_at: string
  venue_name: string | null
  venue_city: string | null
  venue_state: string | null
  capacity: number | null
  registration_count: number
  checked_in_count: number
  created_at: string
  updated_at: string
}

export interface Registration {
  id: string
  event_id: string
  ticket_type_id: string
  user_id: string | null
  attendee_email: string
  attendee_name: string
  status: RegistrationStatus
  qr_code: string
  amount_paid_cents: number
  created_at: string
  updated_at: string
}
