ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS sms_opt_in    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at timestamptz;
