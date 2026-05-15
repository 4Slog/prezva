ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS stripe_session_id text;
CREATE INDEX IF NOT EXISTS registrations_stripe_session_idx ON public.registrations(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
