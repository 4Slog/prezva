create or replace view public.event_visible_profiles
  with (security_invoker = false) as
select
  ap.id, ap.registration_id, ap.event_id, ap.user_id,
  r.attendee_name,
  ap.company, ap.job_title, ap.bio, ap.interests, ap.avatar_url,
  ap.linkedin_url, ap.twitter_url, ap.website_url,
  tt.name as ticket_name,
  ap.created_at
from public.attendee_profiles ap
join public.registrations r on r.id = ap.registration_id
left join public.ticket_types tt on tt.id = r.ticket_type_id
where ap.is_visible = true and is_registered(ap.event_id);

grant select on public.event_visible_profiles to authenticated;
