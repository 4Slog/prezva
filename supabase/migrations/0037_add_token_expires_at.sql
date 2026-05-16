ALTER TABLE public.org_integrations
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

COMMENT ON COLUMN public.org_integrations.token_expires_at IS 'When the current access token expires. NULL = non-expiring (e.g. Mailchimp long-lived tokens)';
