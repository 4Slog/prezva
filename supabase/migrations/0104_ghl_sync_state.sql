create table public.ghl_sync_state (
  id uuid primary key default gen_random_uuid(),
  location_id text not null,
  source text not null,
  event_type text not null,
  external_event_id text not null,
  payload_hash text not null,
  internal_registration_id uuid references public.registrations(id) on delete set null,
  ghl_opportunity_id text,
  status text not null default 'pending',
  retries integer not null default 0,
  last_error text,
  dead_lettered boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ghl_sync_state_unique_event unique (source, event_type, external_event_id)
);

alter table public.ghl_sync_state enable row level security;

create policy "ghl_sync_state_service_only"
  on public.ghl_sync_state for all to service_role using (true) with check (true);

create index ghl_sync_state_location_idx on public.ghl_sync_state(location_id);
create index ghl_sync_state_status_idx on public.ghl_sync_state(status);
create index ghl_sync_state_registration_idx on public.ghl_sync_state(internal_registration_id);

-- Add external_order_id to registrations for GHL payment idempotency
alter table public.registrations add column if not exists external_order_id text unique;
