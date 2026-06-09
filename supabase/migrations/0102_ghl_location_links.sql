create table public.ghl_location_links (
  ghl_location_id text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  ghl_account_id text,
  created_at timestamptz not null default now()
);
alter table public.ghl_location_links enable row level security;
-- service-role-only — hardened form (FOR ALL TO service_role)
create policy "ghl_location_links_service_only"
  on public.ghl_location_links for all to service_role using (true) with check (true);
-- no anon/authenticated policies => implicit deny for all other roles
-- seed the single dev binding: GHL location 4KrDX2FYA2XZ68q88rFS -> Meridian Event Collective
insert into public.ghl_location_links (ghl_location_id, org_id, ghl_account_id)
values ('4KrDX2FYA2XZ68q88rFS', '11111111-1111-4111-8111-111111111101', 'GiFgU1OdT7M8Ld9aQR2T')
on conflict (ghl_location_id) do nothing;
