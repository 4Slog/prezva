alter table public.events add column if not exists ghl_event_id text;
create unique index if not exists events_ghl_event_id_key
  on public.events (ghl_event_id) where ghl_event_id is not null;

alter table public.registrations add column if not exists ghl_attendee_id text;
create unique index if not exists registrations_ghl_attendee_id_key
  on public.registrations (ghl_attendee_id) where ghl_attendee_id is not null;

alter table public.registrations add column if not exists ghl_order_id text;
create index if not exists idx_registrations_ghl_order_id
  on public.registrations (ghl_order_id) where ghl_order_id is not null;
