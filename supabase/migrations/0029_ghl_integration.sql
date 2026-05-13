-- GHL integration schema (Sprint GHL-1)

-- Access token cache columns on org_integrations
alter table public.org_integrations
  add column if not exists encrypted_access_token text,
  add column if not exists token_expires_at timestamptz;

-- GHL account/location IDs on organizations
alter table public.organizations
  add column if not exists ghl_account_id text,
  add column if not exists ghl_location_id text;

-- GHL contact ID on registrations (bidirectional sync)
alter table public.registrations
  add column if not exists ghl_contact_id text;

-- GHL sub-account provisioning log
create table if not exists public.ghl_sub_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ghl_location_id text not null,
  ghl_location_name text,
  agency_ghl_account_id text,
  provisioned_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  unique(org_id, ghl_location_id)
);

alter table public.ghl_sub_accounts enable row level security;
create policy "ghl_sub_accounts_service_only" on public.ghl_sub_accounts using (true) with check (true);

-- Webhook event log (shared across providers)
create table if not exists public.integration_webhook_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null,
  payload jsonb,
  processed_at timestamptz,
  error_message text,
  received_at timestamptz not null default now()
);

alter table public.integration_webhook_log enable row level security;
create policy "webhook_log_service_only" on public.integration_webhook_log using (true) with check (true);

create index if not exists integration_webhook_log_provider_idx
  on public.integration_webhook_log(provider, received_at desc);

create index if not exists registrations_ghl_contact_idx
  on public.registrations(ghl_contact_id) where ghl_contact_id is not null;

create index if not exists organizations_ghl_account_idx
  on public.organizations(ghl_account_id) where ghl_account_id is not null;
