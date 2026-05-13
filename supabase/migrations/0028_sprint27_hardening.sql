-- Sprint 27 — Volunteer module, duplicate registration guard, org_members index, dead-letter table

-- ── Volunteers ────────────────────────────────────────────────────────────────

create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id),
  name text not null,
  email text not null,
  phone text,
  role text not null check (role in (
    'check-in',
    'session-monitor',
    'registration-desk',
    'vip-support',
    'general'
  )),
  shift_start timestamptz,
  shift_end timestamptz,
  assigned_sessions uuid[],
  status text not null default 'invited' check (
    status in ('invited','confirmed','declined','checked_in','no_show')
  ),
  portal_access_token text unique not null
    default encode(gen_random_bytes(16), 'hex'),
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique(event_id, email)
);

create index volunteers_event_idx on volunteers(event_id, status);
create index volunteers_token_idx on volunteers(portal_access_token);

alter table public.volunteers enable row level security;

create policy "volunteers_org_staff"
  on public.volunteers for all
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

-- SECURITY DEFINER function so the volunteer portal can look up a row by token
-- without the caller having a Supabase session
create or replace function public.get_volunteer_by_token(p_token text)
returns public.volunteers
language sql
security definer
stable
as $$
  select * from public.volunteers where portal_access_token = p_token limit 1;
$$;

-- ── Duplicate registration guard ──────────────────────────────────────────────

create unique index if not exists registrations_no_duplicate_idx
  on public.registrations(event_id, attendee_email, ticket_type_id)
  where status not in ('cancelled');

-- ── org_members performance index ─────────────────────────────────────────────
-- has_org_role() runs on every authenticated page load; this eliminates the table scan

create index if not exists org_members_role_idx
  on public.org_members(org_id, user_id, role);

-- ── Dead-letter items ─────────────────────────────────────────────────────────

create table public.dead_letter_items (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null,
  error_message text,
  retry_count int not null default 0,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  event_id uuid references events(id)
);

create index dead_letter_event_idx on dead_letter_items(event_id, resolved_at);

alter table public.dead_letter_items enable row level security;

create policy "dead_letter_org_staff"
  on public.dead_letter_items for all
  using (
    event_id is null
    or public.has_org_role(public.event_org_id(event_id), 'staff')
  );
