-- B9-18: Per-event invite codes and domain-restricted registration
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registration_invite_code text,
  ADD COLUMN IF NOT EXISTS registration_domain_restrict text;
-- registration_invite_code: if set, attendees must enter this code to register
-- registration_domain_restrict: if set, only emails matching this domain (e.g. 'acme.com') can register
