-- 1. per-event, opt-in, default-off (mirrors registrations.sms_opt_in posture)
alter table public.attendee_profiles add column share_email boolean not null default false;

-- 2. codify the drifted owner policy so migrations == live (behavior-preserving)
drop policy if exists "owner can read/write own profile" on public.attendee_profiles;
create policy "owner can read/write own profile" on public.attendee_profiles
  as permissive for all to public
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. append conditional email (email non-null ONLY when opted in). Column appended at END (position 17).
create or replace view public.event_visible_profiles with (security_invoker = false) as
select
  ap.id, ap.registration_id, ap.event_id, ap.user_id, r.attendee_name,
  ap.company, ap.job_title, ap.bio, ap.interests, ap.avatar_url,
  ap.linkedin_url, ap.twitter_url, ap.website_url, tt.name as ticket_name,
  ap.created_at, pr.handle,
  case when ap.share_email then r.attendee_email end as email
from public.attendee_profiles ap
  join public.registrations r on r.id = ap.registration_id
  left join public.ticket_types tt on tt.id = r.ticket_type_id
  left join public.profiles pr on pr.id = ap.user_id
where ap.is_visible = true and is_registered(ap.event_id);
grant select on public.event_visible_profiles to authenticated;
