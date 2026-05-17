ALTER TABLE public.ticket_types
  ADD COLUMN IF NOT EXISTS membership_provider text;

COMMENT ON COLUMN public.ticket_types.membership_provider IS 'Which association integration to verify membership against. NULL = any connected association.';
