-- O153 / F-R14: volunteer door check-ins now go through the shared door
-- check-in and are labelled as such instead of falling back to the column
-- default 'dashboard'. Additive: every existing value stays valid, so the
-- constraint can change before the code that writes 'volunteer' deploys.

ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_checked_in_source_check;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_checked_in_source_check
  CHECK (checked_in_source = ANY (ARRAY['dashboard'::text, 'embed'::text, 'self'::text, 'offline_sync'::text, 'volunteer'::text]));
