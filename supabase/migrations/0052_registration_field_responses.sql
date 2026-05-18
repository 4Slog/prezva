-- Store responses to custom form fields collected at registration
create table if not exists public.registration_field_responses (
  id              uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  field_id        uuid not null references public.form_fields(id) on delete cascade,
  value           text,
  created_at      timestamptz default now()
);
create index if not exists idx_rfr_registration_id on public.registration_field_responses(registration_id);
alter table public.registration_field_responses enable row level security;
create policy "service_role_all" on public.registration_field_responses for all using (true) with check (true);
