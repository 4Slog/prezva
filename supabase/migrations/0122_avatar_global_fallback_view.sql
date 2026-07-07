-- Global-avatar fallback: event_visible_profiles.avatar_url falls back to the
-- user's global profiles.avatar_url when the per-event attendee_profiles.avatar_url is null.
create or replace view public.event_visible_profiles with (security_invoker = false) as
select
  ap.id, ap.registration_id, ap.event_id, ap.user_id, r.attendee_name,
  ap.company, ap.job_title, ap.bio, ap.interests,
  coalesce(ap.avatar_url, pr.avatar_url) as avatar_url,
  ap.linkedin_url, ap.twitter_url, ap.website_url, tt.name as ticket_name,
  ap.created_at, pr.handle,
  case when ap.share_email then r.attendee_email end as email
from public.attendee_profiles ap
  join public.registrations r on r.id = ap.registration_id
  left join public.ticket_types tt on tt.id = r.ticket_type_id
  left join public.profiles pr on pr.id = ap.user_id
where ap.is_visible = true and is_registered(ap.event_id);
grant select on public.event_visible_profiles to authenticated;
