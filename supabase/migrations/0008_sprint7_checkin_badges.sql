-- Sprint 7: Check-in depth + badge system

-- Staff invites (T-076)
create table if not exists staff_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  role text not null default 'staff',
  invited_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- Extend org_members to support 'staff' role (no-op if column already supports it)
-- org_members.role is already text; staff is simply a new value we use in app logic

-- Daily check-ins for multi-day events (T-077)
create table if not exists daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  check_in_date date not null,
  checked_in_at timestamptz default now(),
  checked_in_by uuid references auth.users(id),
  unique (registration_id, check_in_date)
);

-- Badge templates (T-083-090)
create table if not exists badge_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  paper_size text not null default 'badge_4x3',  -- badge_4x3 | badge_4x6 | avery_5160 | letter | a4
  template_json jsonb not null default '{"fields":[],"background":"#ffffff","font_family":"Inter"}',
  is_default boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS
alter table staff_invites enable row level security;
alter table daily_check_ins enable row level security;
alter table badge_templates enable row level security;

-- Service role full access
create policy "service_role_all" on staff_invites for all to service_role using (true) with check (true);
create policy "service_role_all" on daily_check_ins for all to service_role using (true) with check (true);
create policy "service_role_all" on badge_templates for all to service_role using (true) with check (true);

-- Indexes
create index if not exists daily_check_ins_event_id_idx on daily_check_ins(event_id);
create index if not exists daily_check_ins_reg_date_idx on daily_check_ins(registration_id, check_in_date);
create index if not exists badge_templates_event_id_idx on badge_templates(event_id);
create index if not exists staff_invites_event_id_idx on staff_invites(event_id);
create index if not exists staff_invites_token_idx on staff_invites(token);
