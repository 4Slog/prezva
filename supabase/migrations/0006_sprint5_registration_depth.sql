-- Sprint 5: Registration Depth additions

-- ── T-040: Early bird pricing ─────────────────────────────────────────────
alter table public.ticket_types
  add column if not exists early_bird_price_cents int,
  add column if not exists early_bird_ends_at timestamptz;

-- ── T-046: Invite-only tickets ────────────────────────────────────────────
alter table public.ticket_types
  add column if not exists invite_only bool default false not null;

create table if not exists public.ticket_invite_allowlist (
  id uuid primary key default uuid_generate_v4(),
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  unique(ticket_type_id, email)
);

-- ── T-054a: UTM / campaign tracking ──────────────────────────────────────
alter table public.registrations
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

-- ── T-056: Pass fees to registrants ──────────────────────────────────────
alter table public.events
  add column if not exists pass_fees_to_registrant bool default false not null;

-- ── T-057: Offline / manual payment support ───────────────────────────────
alter table public.registrations
  add column if not exists payment_method text default 'stripe' not null,
  add column if not exists paid_offline_at timestamptz,
  add column if not exists paid_offline_by uuid references public.profiles(id);

-- ── T-052: Per-ticket confirmation email template ─────────────────────────
alter table public.ticket_types
  add column if not exists confirmation_email_subject text,
  add column if not exists confirmation_email_body text;

-- ── T-053a: Abandoned cart tracking ──────────────────────────────────────
create table if not exists public.abandoned_carts (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid references public.ticket_types(id) on delete set null,
  email text not null,
  reminded_at timestamptz,
  converted bool default false,
  created_at timestamptz default now(),
  unique(event_id, email)
);
create index if not exists idx_abandoned_carts_event_id on public.abandoned_carts(event_id);
create index if not exists idx_abandoned_carts_email on public.abandoned_carts(email);

-- ── T-042: Add-ons ───────────────────────────────────────────────────────
create table if not exists public.add_ons (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  price_cents int not null default 0,
  currency text default 'usd',
  quantity int,
  quantity_sold int default 0,
  is_active bool default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_add_ons_event_id on public.add_ons(event_id);

create table if not exists public.registration_add_ons (
  id uuid primary key default uuid_generate_v4(),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  add_on_id uuid not null references public.add_ons(id),
  quantity int default 1,
  price_cents int not null,
  created_at timestamptz default now(),
  unique(registration_id, add_on_id)
);

-- ── T-043: Custom fields per add-on / form builder ────────────────────────
create table if not exists public.form_fields (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid references public.ticket_types(id) on delete cascade,
  add_on_id uuid references public.add_ons(id) on delete cascade,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'select', 'checkbox', 'radio', 'email', 'phone', 'date')),
  options jsonb,
  is_required bool default false,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_form_fields_event_id on public.form_fields(event_id);
create index if not exists idx_form_fields_ticket_type_id on public.form_fields(ticket_type_id);

-- ── T-044: Add-on session mapping ────────────────────────────────────────
create table if not exists public.add_on_sessions (
  add_on_id uuid not null references public.add_ons(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  primary key (add_on_id, session_id)
);

-- ── T-045: Group tickets ──────────────────────────────────────────────────
create table if not exists public.group_tickets (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  group_size int not null check (group_size >= 2),
  discount_percent int not null check (discount_percent between 1 and 100),
  payer_registration_id uuid references public.registrations(id),
  member_registration_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- ── T-053: Attendee tiering / session access control ─────────────────────
create table if not exists public.session_ticket_access (
  session_id uuid not null references public.sessions(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  primary key (session_id, ticket_type_id)
);

-- RLS policies for new tables ─────────────────────────────────────────────
alter table public.ticket_invite_allowlist enable row level security;
alter table public.abandoned_carts enable row level security;
alter table public.add_ons enable row level security;
alter table public.registration_add_ons enable row level security;
alter table public.form_fields enable row level security;
alter table public.add_on_sessions enable row level security;
alter table public.group_tickets enable row level security;
alter table public.session_ticket_access enable row level security;

-- Service role gets full access (Supabase backend calls)
create policy "service_role_all" on public.ticket_invite_allowlist for all using (true) with check (true);
create policy "service_role_all" on public.abandoned_carts for all using (true) with check (true);
create policy "service_role_all" on public.add_ons for all using (true) with check (true);
create policy "service_role_all" on public.registration_add_ons for all using (true) with check (true);
create policy "service_role_all" on public.form_fields for all using (true) with check (true);
create policy "service_role_all" on public.add_on_sessions for all using (true) with check (true);
create policy "service_role_all" on public.group_tickets for all using (true) with check (true);
create policy "service_role_all" on public.session_ticket_access for all using (true) with check (true);
