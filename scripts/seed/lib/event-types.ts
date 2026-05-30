/** Shared TypeScript types for stages 03 (events) and 04 (event-config). */

export interface TrackDef {
  id: string
  name: string
  color?: string
  sort_order?: number
}

export interface RoomDef {
  id: string
  name: string
  capacity?: number
  location_hint?: string
  sort_order?: number
}

export interface TicketTypeDef {
  id: string
  name: string
  type: 'free' | 'paid' | 'donation'
  price_cents?: number
  delivery_method?: string
  is_active?: boolean
  sort_order?: number
}

export interface SpeakerDef {
  id: string
  name: string
  bio?: string
  job_title?: string
  company?: string
  photo_url?: string | null
  status?: string
  event_role?: string
  confirmed_at?: string | null
  sort_order?: number
}

export interface SessionDef {
  id: string
  title: string
  description?: string
  session_type?: string
  track_id?: string | null
  room_id?: string | null
  starts_at: string
  ends_at: string
  speaker_ids?: string[]
  ce_credit_hours?: number
  is_published?: boolean
  video_url?: string | null
  sort_order?: number
}

export interface FormFieldDef {
  id: string
  field_key: string
  label: string
  field_type: string
  is_required?: boolean
  sort_order?: number
  options?: string[] | null
}

export interface EventDef {
  id: string
  org_id: string
  title: string
  slug: string
  status: string
  event_type: string
  timezone: string
  is_discoverable: boolean
  start_at: string
  end_at: string
  description?: string
  venue_name?: string
  venue_city?: string
  venue_state?: string
  virtual_url?: string
  capacity?: number
  certificate_enabled?: boolean
  certificate_min_session_attendance_pct?: number
  tracks?: TrackDef[]
  rooms?: RoomDef[]
  ticket_types?: TicketTypeDef[]
  speakers?: SpeakerDef[]
  sessions?: SessionDef[]
  form_fields?: FormFieldDef[]
}

export interface EventsFileData {
  events: EventDef[]
}
