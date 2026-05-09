-- ─────────────────────────────────────────────────────────────
-- PREZVA — 0001_initial_schema.sql
-- Full Phase 1 schema: orgs, events, registration, check-in,
-- agenda, speakers, attendees, announcements, messaging,
-- surveys, analytics, audit logs
-- ─────────────────────────────────────────────────────────────

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";  -- fuzzy search

-- ─────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────
create type org_role as enum ('owner', 'admin', 'staff');
create type event_status as enum ('draft', 'published', 'live', 'ended', 'archived', 'cancelled');
create type event_type as enum ('in_person', 'virtual', 'hybrid');
create type event_visibility as enum ('public', 'private', 'unlisted');
create type ticket_type as enum ('free', 'paid', 'donation');
create type registration_status as enum ('pending', 'confirmed', 'cancelled', 'waitlisted', 'refunded');
create type checkin_method as enum ('qr_scan', 'manual', 'kiosk', 'self');
create type announcement_status as enum ('draft', 'scheduled', 'sent');
create type announcement_channel as enum ('email', 'push', 'both');
create type session_type as enum ('talk', 'workshop', 'panel', 'keynote', 'break', 'networking', 'other');
create type survey_status as enum ('draft', 'active', 'closed');
create type question_type as enum ('text', 'textarea', 'single_choice', 'multiple_choice', 'rating', 'nps', 'boolean');
create type message_status as enum ('sent', 'delivered', 'read');
create type audit_action as enum ('create', 'update', 'delete', 'login', 'logout', 'checkin', 'register', 'payment', 'export');

-- ─────────────────────────────────────────
-- PROFILES (extends auth.users)
-- ─────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  phone text,
  bio text,
  job_title text,
  company text,
  website text,
  linkedin_url text,
  twitter_handle text,
  timezone text default 'America/Chicago',
  notification_email bool default true,
  notification_push bool default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- ORGANIZATIONS
-- ─────────────────────────────────────────
create table public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  logo_url text,
  website text,
  description text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  country text default 'US',
  timezone text default 'America/Chicago',
  stripe_customer_id text,
  stripe_account_id text,
  is_active bool default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.org_members (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role org_role not null default 'staff',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz default now(),
  unique(org_id, user_id)
);

-- ─────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────
create table public.events (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null,
  slug text not null,
  description text,
  cover_image_url text,
  event_type event_type default 'in_person',
  status event_status default 'draft',
  visibility event_visibility default 'public',
  timezone text default 'America/Chicago',
  start_at timestamptz not null,
  end_at timestamptz not null,
  -- venue
  venue_name text,
  venue_address text,
  venue_city text,
  venue_state text,
  venue_country text default 'US',
  venue_zip text,
  venue_lat numeric(10,7),
  venue_lng numeric(10,7),
  venue_map_url text,
  -- virtual
  virtual_url text,
  -- capacity
  capacity int,
  waitlist_enabled bool default false,
  -- settings
  allow_public_attendee_list bool default true,
  require_approval bool default false,
  check_in_opens_at timestamptz,
  -- counts (denormalized for perf)
  registration_count int default 0,
  checked_in_count int default 0,
  unique(org_id, slug),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint end_after_start check (end_at > start_at)
);

-- ─────────────────────────────────────────
-- TICKET TYPES
-- ─────────────────────────────────────────
create table public.ticket_types (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  description text,
  type ticket_type default 'free',
  price_cents int default 0,
  currency text default 'usd',
  quantity int,                       -- null = unlimited
  quantity_sold int default 0,
  max_per_order int default 10,
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  is_visible bool default true,
  is_active bool default true,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint price_non_negative check (price_cents >= 0)
);

-- ─────────────────────────────────────────
-- DISCOUNT CODES
-- ─────────────────────────────────────────
create table public.discount_codes (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value int not null,        -- percent (0-100) or cents
  max_uses int,                       -- null = unlimited
  uses_count int default 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active bool default true,
  created_at timestamptz default now(),
  unique(event_id, code)
);

-- ─────────────────────────────────────────
-- REGISTRATIONS
-- ─────────────────────────────────────────
create table public.registrations (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  user_id uuid references public.profiles(id),   -- null = guest registration
  -- attendee info (captured at registration, may differ from profile)
  attendee_email text not null,
  attendee_name text not null,
  attendee_phone text,
  attendee_company text,
  attendee_job_title text,
  -- status
  status registration_status default 'pending',
  -- payment
  stripe_payment_intent_id text,
  stripe_charge_id text,
  amount_paid_cents int default 0,
  currency text default 'usd',
  discount_code_id uuid references public.discount_codes(id),
  discount_amount_cents int default 0,
  refunded_at timestamptz,
  refund_amount_cents int default 0,
  -- qr
  qr_code text unique default encode(gen_random_bytes(16), 'hex'),
  -- custom fields
  custom_fields jsonb default '{}',
  -- tags/segments
  tags text[] default '{}',
  -- confirmation
  confirmation_sent_at timestamptz,
  waitlist_position int,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- CHECK-INS
-- ─────────────────────────────────────────
create table public.check_ins (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  registration_id uuid not null references public.registrations(id) on delete cascade,
  session_id uuid,                    -- FK added after sessions table
  checked_in_by uuid references public.profiles(id),
  method checkin_method default 'qr_scan',
  checked_in_at timestamptz default now(),
  device_id text,                     -- for offline sync deduplication
  synced_at timestamptz,              -- null = came from offline queue
  unique(registration_id, session_id) -- prevent duplicate check-in per session
);

-- offline queue — stores check-ins when device has no internet
create table public.offline_queue (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  device_id text not null,
  qr_code text not null,
  scanned_at timestamptz not null,
  processed_at timestamptz,
  error text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- SPEAKERS
-- ─────────────────────────────────────────
create table public.speakers (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id),  -- null = external speaker
  name text not null,
  email text,
  bio text,
  photo_url text,
  job_title text,
  company text,
  website text,
  linkedin_url text,
  twitter_handle text,
  sort_order int default 0,
  is_published bool default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- AGENDA: TRACKS, ROOMS, SESSIONS
-- ─────────────────────────────────────────
create table public.tracks (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  color text default '#3B82F6',
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.rooms (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  capacity int,
  location_hint text,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.sessions (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  title text not null,
  description text,
  session_type session_type default 'talk',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int,
  is_published bool default true,
  recording_url text,
  slides_url text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint session_end_after_start check (ends_at > starts_at)
);

-- add session FK to check_ins now that sessions table exists
alter table public.check_ins
  add constraint check_ins_session_id_fkey
  foreign key (session_id) references public.sessions(id) on delete set null;

create table public.session_speakers (
  session_id uuid not null references public.sessions(id) on delete cascade,
  speaker_id uuid not null references public.speakers(id) on delete cascade,
  sort_order int default 0,
  primary key (session_id, speaker_id)
);

-- personal agenda (attendee bookmarks sessions)
create table public.session_bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, session_id)
);

-- ─────────────────────────────────────────
-- ANNOUNCEMENTS
-- ─────────────────────────────────────────
create table public.announcements (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null,
  body text not null,
  channel announcement_channel default 'both',
  status announcement_status default 'draft',
  target_tags text[],                 -- null = all attendees
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- MESSAGING (1:1)
-- ─────────────────────────────────────────
create table public.conversations (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid references public.events(id) on delete cascade,
  participant_a uuid not null references public.profiles(id),
  participant_b uuid not null references public.profiles(id),
  last_message_at timestamptz,
  created_at timestamptz default now(),
  unique(event_id, participant_a, participant_b),
  constraint no_self_message check (participant_a <> participant_b)
);

create table public.messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null,
  status message_status default 'sent',
  read_at timestamptz,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- SURVEYS
-- ─────────────────────────────────────────
create table public.surveys (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  title text not null,
  description text,
  status survey_status default 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  is_anonymous bool default false,
  send_auto bool default true,        -- auto-send at event end
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.survey_questions (
  id uuid primary key default uuid_generate_v4(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  question_type question_type default 'text',
  question_text text not null,
  options jsonb default '[]',         -- for choice questions
  is_required bool default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table public.survey_responses (
  id uuid primary key default uuid_generate_v4(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz default now(),
  unique(survey_id, registration_id)
);

create table public.survey_answers (
  id uuid primary key default uuid_generate_v4(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  answer_text text,
  answer_choice text[],
  answer_number numeric,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- AUDIT LOGS (GDPR required — day one)
-- ─────────────────────────────────────────
create table public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references public.organizations(id) on delete set null,
  event_id uuid references public.events(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  action audit_action not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────

-- profiles
create index idx_profiles_email on public.profiles(email);

-- organizations
create index idx_organizations_slug on public.organizations(slug);

-- org_members
create index idx_org_members_user_id on public.org_members(user_id);
create index idx_org_members_org_id on public.org_members(org_id);

-- events
create index idx_events_org_id on public.events(org_id);
create index idx_events_status on public.events(status);
create index idx_events_start_at on public.events(start_at);
create index idx_events_slug on public.events(org_id, slug);

-- ticket_types
create index idx_ticket_types_event_id on public.ticket_types(event_id);

-- registrations
create index idx_registrations_event_id on public.registrations(event_id);
create index idx_registrations_user_id on public.registrations(user_id);
create index idx_registrations_qr_code on public.registrations(qr_code);
create index idx_registrations_email on public.registrations(attendee_email);
create index idx_registrations_status on public.registrations(status);
-- trigram index for fuzzy name search (check-in fallback)
create index idx_registrations_name_trgm on public.registrations using gin(attendee_name gin_trgm_ops);

-- check_ins
create index idx_check_ins_event_id on public.check_ins(event_id);
create index idx_check_ins_registration_id on public.check_ins(registration_id);
create index idx_check_ins_checked_in_at on public.check_ins(checked_in_at);

-- offline_queue
create index idx_offline_queue_event_id on public.offline_queue(event_id);
create index idx_offline_queue_processed on public.offline_queue(processed_at) where processed_at is null;

-- sessions
create index idx_sessions_event_id on public.sessions(event_id);
create index idx_sessions_starts_at on public.sessions(starts_at);
create index idx_sessions_track_id on public.sessions(track_id);

-- speakers
create index idx_speakers_event_id on public.speakers(event_id);

-- announcements
create index idx_announcements_event_id on public.announcements(event_id);
create index idx_announcements_status on public.announcements(status);

-- messages
create index idx_messages_conversation_id on public.messages(conversation_id);
create index idx_messages_created_at on public.messages(created_at);

-- surveys
create index idx_surveys_event_id on public.surveys(event_id);

-- audit_logs
create index idx_audit_logs_org_id on public.audit_logs(org_id);
create index idx_audit_logs_user_id on public.audit_logs(user_id);
create index idx_audit_logs_event_id on public.audit_logs(event_id);
create index idx_audit_logs_created_at on public.audit_logs(created_at);

-- ─────────────────────────────────────────
-- UPDATED_AT TRIGGER FUNCTION
-- ─────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- apply to all tables with updated_at
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function public.handle_updated_at();
create trigger trg_organizations_updated_at before update on public.organizations for each row execute function public.handle_updated_at();
create trigger trg_events_updated_at before update on public.events for each row execute function public.handle_updated_at();
create trigger trg_ticket_types_updated_at before update on public.ticket_types for each row execute function public.handle_updated_at();
create trigger trg_registrations_updated_at before update on public.registrations for each row execute function public.handle_updated_at();
create trigger trg_sessions_updated_at before update on public.sessions for each row execute function public.handle_updated_at();
create trigger trg_speakers_updated_at before update on public.speakers for each row execute function public.handle_updated_at();
create trigger trg_surveys_updated_at before update on public.surveys for each row execute function public.handle_updated_at();
create trigger trg_announcements_updated_at before update on public.announcements for each row execute function public.handle_updated_at();

-- ─────────────────────────────────────────
-- NEW USER TRIGGER (auto-create profile)
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────
-- REGISTRATION COUNT TRIGGERS
-- ─────────────────────────────────────────
create or replace function public.update_registration_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' and NEW.status = 'confirmed' then
    update public.events set registration_count = registration_count + 1 where id = NEW.event_id;
    update public.ticket_types set quantity_sold = quantity_sold + 1 where id = NEW.ticket_type_id;
  elsif TG_OP = 'UPDATE' then
    if OLD.status <> 'confirmed' and NEW.status = 'confirmed' then
      update public.events set registration_count = registration_count + 1 where id = NEW.event_id;
      update public.ticket_types set quantity_sold = quantity_sold + 1 where id = NEW.ticket_type_id;
    elsif OLD.status = 'confirmed' and NEW.status in ('cancelled', 'refunded') then
      update public.events set registration_count = greatest(0, registration_count - 1) where id = NEW.event_id;
      update public.ticket_types set quantity_sold = greatest(0, quantity_sold - 1) where id = NEW.ticket_type_id;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger trg_registration_count
  after insert or update on public.registrations
  for each row execute function public.update_registration_count();

-- ─────────────────────────────────────────
-- CHECK-IN COUNT TRIGGER
-- ─────────────────────────────────────────
create or replace function public.update_checkin_count()
returns trigger language plpgsql security definer as $$
begin
  update public.events
    set checked_in_count = checked_in_count + 1
    where id = NEW.event_id;
  return NEW;
end;
$$;

create trigger trg_checkin_count
  after insert on public.check_ins
  for each row execute function public.update_checkin_count();

-- ─────────────────────────────────────────
-- CAPACITY ENFORCEMENT
-- ─────────────────────────────────────────
create or replace function public.enforce_ticket_capacity()
returns trigger language plpgsql as $$
declare
  v_quantity int;
  v_sold int;
begin
  select quantity, quantity_sold into v_quantity, v_sold
  from public.ticket_types where id = NEW.ticket_type_id;

  if v_quantity is not null and v_sold >= v_quantity then
    raise exception 'Ticket type is sold out' using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

create trigger trg_enforce_capacity
  before insert on public.registrations
  for each row execute function public.enforce_ticket_capacity();

