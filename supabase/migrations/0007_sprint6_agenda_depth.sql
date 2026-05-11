-- Sprint 6: Agenda Depth

-- ── T-059: Session tags ───────────────────────────────────────────────────────
alter table public.sessions
  add column if not exists tags text[] default '{}';

-- ── T-065: Session visibility scheduling ─────────────────────────────────────
alter table public.sessions
  add column if not exists visible_from timestamptz,
  add column if not exists visible_until timestamptz;

-- ── T-072a: Session video embed ───────────────────────────────────────────────
alter table public.sessions
  add column if not exists video_url text;

-- ── T-072a: Session chat + Q&A ───────────────────────────────────────────────
create table if not exists public.session_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_moderated bool default false,
  created_at timestamptz default now()
);
create index if not exists idx_session_messages_session_id on public.session_messages(session_id);
create index if not exists idx_session_messages_created_at on public.session_messages(session_id, created_at);

create table if not exists public.session_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  upvote_count int default 0,
  is_answered bool default false,
  is_moderated bool default false,
  created_at timestamptz default now()
);
create index if not exists idx_session_questions_session_id on public.session_questions(session_id);

create table if not exists public.session_question_upvotes (
  question_id uuid not null references public.session_questions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (question_id, user_id)
);

-- ── T-072: Attendee session notes ────────────────────────────────────────────
create table if not exists public.session_notes (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  updated_at timestamptz default now(),
  unique(session_id, user_id)
);

-- ── T-067: Session documents ─────────────────────────────────────────────────
create table if not exists public.session_documents (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  is_public bool default true,
  sort_order int default 0,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_session_documents_session_id on public.session_documents(session_id);

-- ── T-068: Event document folders ────────────────────────────────────────────
create table if not exists public.event_folders (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_event_folders_event_id on public.event_folders(event_id);

create table if not exists public.event_documents (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  folder_id uuid references public.event_folders(id) on delete set null,
  name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  is_public bool default true,
  fts tsvector generated always as (to_tsvector('english', name)) stored,
  sort_order int default 0,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);
create index if not exists idx_event_documents_event_id on public.event_documents(event_id);
create index if not exists idx_event_documents_folder_id on public.event_documents(folder_id);
create index if not exists idx_event_documents_fts on public.event_documents using gin(fts);

-- ── T-069: Venue maps ────────────────────────────────────────────────────────
create table if not exists public.venue_maps (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null default 'Venue Map',
  storage_path text not null,
  hotspots jsonb default '[]',
  sort_order int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_venue_maps_event_id on public.venue_maps(event_id);

-- ── T-070: Waivers ───────────────────────────────────────────────────────────
create table if not exists public.event_waivers (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  body text not null,
  is_required bool default true,
  created_at timestamptz default now()
);
create index if not exists idx_event_waivers_event_id on public.event_waivers(event_id);

create table if not exists public.waiver_signatures (
  id uuid primary key default uuid_generate_v4(),
  waiver_id uuid not null references public.event_waivers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  registration_id uuid references public.registrations(id) on delete set null,
  signed_at timestamptz default now(),
  unique(waiver_id, user_id)
);
create index if not exists idx_waiver_signatures_waiver_id on public.waiver_signatures(waiver_id);
create index if not exists idx_waiver_signatures_user_id on public.waiver_signatures(user_id);

-- ── RLS on all new tables ─────────────────────────────────────────────────────
alter table public.session_messages enable row level security;
alter table public.session_questions enable row level security;
alter table public.session_question_upvotes enable row level security;
alter table public.session_notes enable row level security;
alter table public.session_documents enable row level security;
alter table public.event_folders enable row level security;
alter table public.event_documents enable row level security;
alter table public.venue_maps enable row level security;
alter table public.event_waivers enable row level security;
alter table public.waiver_signatures enable row level security;

-- Service role full access
create policy "service_role_all" on public.session_messages for all using (true) with check (true);
create policy "service_role_all" on public.session_questions for all using (true) with check (true);
create policy "service_role_all" on public.session_question_upvotes for all using (true) with check (true);
create policy "service_role_all" on public.session_notes for all using (true) with check (true);
create policy "service_role_all" on public.session_documents for all using (true) with check (true);
create policy "service_role_all" on public.event_folders for all using (true) with check (true);
create policy "service_role_all" on public.event_documents for all using (true) with check (true);
create policy "service_role_all" on public.venue_maps for all using (true) with check (true);
create policy "service_role_all" on public.event_waivers for all using (true) with check (true);
create policy "service_role_all" on public.waiver_signatures for all using (true) with check (true);
