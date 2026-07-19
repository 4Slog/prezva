alter table public.org_integrations
  add column if not exists encrypted_access_token text,
  add column if not exists token_expires_at timestamptz;
