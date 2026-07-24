-- SEC-1: profiles.email and profiles.phone are readable by any anon or authenticated
-- caller. RLS gates rows, not columns, so the fix is at the grant layer.
-- A column-level REVOKE cannot carve columns out of a table-level grant (see 0133),
-- so revoke table-level SELECT and grant back only the display columns.
-- Does NOT touch profiles_select_any (21 sites need cross-user display reads).
-- Does NOT touch the consent surface: event_visible_profiles reads email from
-- registrations.attendee_email gated on attendee_profiles.share_email, and takes only
-- avatar_url + handle from profiles.

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (id, full_name, avatar_url, handle, handle_customized, job_title, company, bio)
  ON public.profiles TO anon, authenticated;
