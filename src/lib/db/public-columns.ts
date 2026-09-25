// Explicit column lists for the four tables whose bearer-token columns are
// closed to anon/authenticated by migration 0157. A user (RLS) client that
// selects '*' — or calls .insert()/.update() then a bare .select() — on these
// tables now fails with "permission denied", so user-client reads name their
// columns from here. Every column except the secret ones is listed, so
// replacing '*' with these changes nothing else.
//
// Secret columns (service-role only; read them with createAdminClient after an
// authorization check):
//   events.mc_token, events.lobby_token
//   sessions.session_qr_token
//   speakers.confirmation_token, speakers.portal_token_expires_at
//   event_sponsors.portal_access_token
//
// Kept as single string literals so supabase-js can still infer row types.
// When a column is added to one of these tables, add it here too (and to the
// 0157-style GRANT, which a new column does not inherit).

export const EVENT_COLUMNS =
  'id, org_id, created_by, title, slug, description, cover_image_url, event_type, status, visibility, timezone, start_at, end_at, venue_name, venue_address, venue_city, venue_state, venue_country, venue_zip, venue_lat, venue_lng, venue_map_url, virtual_url, capacity, waitlist_enabled, allow_public_attendee_list, require_approval, check_in_opens_at, registration_count, checked_in_count, created_at, updated_at, speaker_form_schema, pass_fees_to_registrant, parent_event_id, recurrence, next_occurrence_date, certificate_enabled, certificate_min_session_attendance_pct, certificate_template_id, leaderboard_point_config, registration_invite_code, registration_domain_restrict, speaker_day_of_info, is_discoverable, badge_rules, tags, category, ghl_creator_email, ghl_event_id'

export const SESSION_COLUMNS =
  'id, event_id, track_id, room_id, title, description, session_type, starts_at, ends_at, capacity, is_published, recording_url, slides_url, sort_order, created_at, updated_at, tags, visible_from, visible_until, video_url, ce_credit_hours, sponsored_by_id, mux_stream_id, mux_playback_id, livekit_room_name, recording_enabled, allow_rewatch, mux_asset_id, mux_asset_playback_id, simulive_scheduled_at, simulive_started_at'

export const SPEAKER_COLUMNS =
  'id, event_id, user_id, name, email, bio, photo_url, job_title, company, website, linkedin_url, twitter_handle, sort_order, is_published, created_at, updated_at, status, confirmed_at, event_role, decline_reason, decline_alternative, checked_in_at, ghl_contact_id'

export const SPONSOR_COLUMNS =
  'id, event_id, name, website_url, logo_url, tier, sort_order, is_featured, created_at, updated_at, slug, description, contact_email, materials'

export const SECRET_TOKEN_COLUMNS = {
  events: ['mc_token', 'lobby_token'],
  sessions: ['session_qr_token'],
  speakers: ['confirmation_token', 'portal_token_expires_at'],
  event_sponsors: ['portal_access_token'],
} as const
