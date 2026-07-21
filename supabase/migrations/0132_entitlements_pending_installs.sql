-- GE-8 entitlement batch (R36-R41): one entitlement flag on organizations,
-- plus the pending-install parking table for state-less marketplace OAuth
-- callbacks (cold installs with no org yet — bound to an org at claim time).

alter table public.organizations
  add column if not exists plan text not null default 'free',
  add column if not exists entitled_until timestamptz;

create table public.ghl_pending_installs (
  ghl_location_id text primary key,
  ghl_company_id text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  token_expires_at timestamptz,
  scopes text[],
  created_at timestamptz not null default now()
);

alter table public.ghl_pending_installs enable row level security;

create policy "ghl_pending_installs_select_service_only"
  on public.ghl_pending_installs for select to service_role using (true);

create policy "ghl_pending_installs_insert_service_only"
  on public.ghl_pending_installs for insert to service_role with check (true);

create policy "ghl_pending_installs_update_service_only"
  on public.ghl_pending_installs for update to service_role using (true) with check (true);

create policy "ghl_pending_installs_delete_service_only"
  on public.ghl_pending_installs for delete to service_role using (true);

-- No PUBLIC, no anon, no authenticated grants — this table holds unbound
-- OAuth tokens with no per-row tenant filter to RLS against.
revoke all on public.ghl_pending_installs from anon, authenticated;
