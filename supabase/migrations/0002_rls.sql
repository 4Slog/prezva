-- ─────────────────────────────────────────────────────────────
-- PREZVA — 0002_rls.sql
-- Row Level Security policies for all 23 tables
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────
-- HELPER FUNCTIONS
-- ─────────────────────────────────────────

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql security definer stable as
$$
  select exists (
    select 1 from public.org_members
    where org_members.org_id = $1
      and org_members.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org_id uuid, min_role org_role)
returns boolean language sql security definer stable as
$$
  select exists (
    select 1 from public.org_members
    where org_members.org_id = $1
      and org_members.user_id = auth.uid()
      and case $2
            when 'staff'  then role in ('staff', 'admin', 'owner')
            when 'admin'  then role in ('admin', 'owner')
            when 'owner'  then role = 'owner'
          end
  );
$$;

create or replace function public.is_registered(event_id uuid)
returns boolean language sql security definer stable as
$$
  select exists (
    select 1 from public.registrations
    where registrations.event_id = $1
      and registrations.user_id = auth.uid()
      and registrations.status = 'confirmed'
  );
$$;

create or replace function public.event_org_id(event_id uuid)
returns uuid language sql security definer stable as
$$
  select org_id from public.events where id = $1;
$$;

-- ─────────────────────────────────────────
-- ENABLE RLS ON ALL TABLES
-- ─────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.discount_codes enable row level security;
alter table public.registrations enable row level security;
alter table public.check_ins enable row level security;
alter table public.offline_queue enable row level security;
alter table public.speakers enable row level security;
alter table public.tracks enable row level security;
alter table public.rooms enable row level security;
alter table public.sessions enable row level security;
alter table public.session_speakers enable row level security;
alter table public.session_bookmarks enable row level security;
alter table public.announcements enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_answers enable row level security;
alter table public.audit_logs enable row level security;

-- ─────────────────────────────────────────
-- PROFILES
-- ─────────────────────────────────────────
create policy "profiles_select_any"
  on public.profiles for select
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ─────────────────────────────────────────
-- ORGANIZATIONS
-- ─────────────────────────────────────────
create policy "orgs_select_member"
  on public.organizations for select
  using (public.is_org_member(id));

create policy "orgs_update_owner"
  on public.organizations for update
  using (public.has_org_role(id, 'owner'));

create policy "orgs_insert_authenticated"
  on public.organizations for insert
  with check (auth.uid() is not null);

create policy "orgs_delete_owner"
  on public.organizations for delete
  using (public.has_org_role(id, 'owner'));

-- ─────────────────────────────────────────
-- ORG MEMBERS
-- ─────────────────────────────────────────
create policy "org_members_select"
  on public.org_members for select
  using (public.is_org_member(org_id));

create policy "org_members_insert"
  on public.org_members for insert
  with check (public.has_org_role(org_id, 'admin'));

create policy "org_members_update"
  on public.org_members for update
  using (public.has_org_role(org_id, 'admin'));

create policy "org_members_delete"
  on public.org_members for delete
  using (
    public.has_org_role(org_id, 'owner')
    or user_id = auth.uid()
  );

-- ─────────────────────────────────────────
-- EVENTS
-- ─────────────────────────────────────────
create policy "events_select_public"
  on public.events for select
  using (
    status in ('published', 'live')
    or public.is_org_member(org_id)
  );

create policy "events_insert_staff"
  on public.events for insert
  with check (public.has_org_role(org_id, 'staff'));

create policy "events_update_staff"
  on public.events for update
  using (public.has_org_role(org_id, 'staff'));

create policy "events_delete_admin"
  on public.events for delete
  using (public.has_org_role(org_id, 'admin'));

-- ─────────────────────────────────────────
-- TICKET TYPES
-- ─────────────────────────────────────────
create policy "ticket_types_select"
  on public.ticket_types for select
  using (
    is_visible = true
    and exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status in ('published', 'live') or public.is_org_member(e.org_id))
    )
  );

create policy "ticket_types_insert"
  on public.ticket_types for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "ticket_types_update"
  on public.ticket_types for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "ticket_types_delete"
  on public.ticket_types for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- DISCOUNT CODES
-- ─────────────────────────────────────────
create policy "discount_codes_select"
  on public.discount_codes for select
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "discount_codes_insert"
  on public.discount_codes for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "discount_codes_update"
  on public.discount_codes for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "discount_codes_delete"
  on public.discount_codes for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- REGISTRATIONS
-- ─────────────────────────────────────────
create policy "registrations_select"
  on public.registrations for select
  using (
    user_id = auth.uid()
    or public.has_org_role(public.event_org_id(event_id), 'staff')
  );

create policy "registrations_insert"
  on public.registrations for insert
  with check (auth.uid() is not null);

create policy "registrations_update"
  on public.registrations for update
  using (
    user_id = auth.uid()
    or public.has_org_role(public.event_org_id(event_id), 'staff')
  );

create policy "registrations_delete"
  on public.registrations for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- CHECK-INS
-- ─────────────────────────────────────────
create policy "check_ins_select"
  on public.check_ins for select
  using (
    public.has_org_role(public.event_org_id(event_id), 'staff')
    or exists (
      select 1 from public.registrations r
      where r.id = registration_id and r.user_id = auth.uid()
    )
  );

create policy "check_ins_insert"
  on public.check_ins for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

-- ─────────────────────────────────────────
-- OFFLINE QUEUE
-- ─────────────────────────────────────────
create policy "offline_queue_select"
  on public.offline_queue for select
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "offline_queue_insert"
  on public.offline_queue for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "offline_queue_update"
  on public.offline_queue for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

-- ─────────────────────────────────────────
-- SPEAKERS
-- ─────────────────────────────────────────
create policy "speakers_select"
  on public.speakers for select
  using (
    is_published = true
    or public.has_org_role(public.event_org_id(event_id), 'staff')
  );

create policy "speakers_insert"
  on public.speakers for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "speakers_update"
  on public.speakers for update
  using (
    public.has_org_role(public.event_org_id(event_id), 'staff')
    or user_id = auth.uid()
  );

create policy "speakers_delete"
  on public.speakers for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- TRACKS
-- ─────────────────────────────────────────
create policy "tracks_select"
  on public.tracks for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status in ('published', 'live', 'ended') or public.is_org_member(e.org_id))
    )
  );

create policy "tracks_insert"
  on public.tracks for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "tracks_update"
  on public.tracks for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "tracks_delete"
  on public.tracks for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- ROOMS
-- ─────────────────────────────────────────
create policy "rooms_select"
  on public.rooms for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id
        and (e.status in ('published', 'live', 'ended') or public.is_org_member(e.org_id))
    )
  );

create policy "rooms_insert"
  on public.rooms for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "rooms_update"
  on public.rooms for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "rooms_delete"
  on public.rooms for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- SESSIONS
-- ─────────────────────────────────────────
create policy "sessions_select"
  on public.sessions for select
  using (
    (is_published = true and exists (
      select 1 from public.events e
      where e.id = event_id and e.status in ('published', 'live', 'ended')
    ))
    or public.has_org_role(public.event_org_id(event_id), 'staff')
  );

create policy "sessions_insert"
  on public.sessions for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "sessions_update"
  on public.sessions for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "sessions_delete"
  on public.sessions for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- SESSION SPEAKERS
-- ─────────────────────────────────────────
create policy "session_speakers_select"
  on public.session_speakers for select
  using (
    exists (
      select 1 from public.sessions s
      join public.events e on e.id = s.event_id
      where s.id = session_id
        and (s.is_published = true or public.is_org_member(e.org_id))
    )
  );

create policy "session_speakers_insert"
  on public.session_speakers for insert
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.has_org_role(public.event_org_id(s.event_id), 'staff')
    )
  );

create policy "session_speakers_delete"
  on public.session_speakers for delete
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_id
        and public.has_org_role(public.event_org_id(s.event_id), 'staff')
    )
  );

-- ─────────────────────────────────────────
-- SESSION BOOKMARKS
-- ─────────────────────────────────────────
create policy "session_bookmarks_select"
  on public.session_bookmarks for select
  using (user_id = auth.uid());

create policy "session_bookmarks_insert"
  on public.session_bookmarks for insert
  with check (user_id = auth.uid());

create policy "session_bookmarks_delete"
  on public.session_bookmarks for delete
  using (user_id = auth.uid());

-- ─────────────────────────────────────────
-- ANNOUNCEMENTS
-- ─────────────────────────────────────────
create policy "announcements_select"
  on public.announcements for select
  using (
    public.has_org_role(public.event_org_id(event_id), 'staff')
    or (status = 'sent' and public.is_registered(event_id))
  );

create policy "announcements_insert"
  on public.announcements for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "announcements_update"
  on public.announcements for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "announcements_delete"
  on public.announcements for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- CONVERSATIONS
-- ─────────────────────────────────────────
create policy "conversations_select"
  on public.conversations for select
  using (
    participant_a = auth.uid()
    or participant_b = auth.uid()
  );

create policy "conversations_insert"
  on public.conversations for insert
  with check (
    auth.uid() is not null
    and (participant_a = auth.uid() or participant_b = auth.uid())
  );

-- ─────────────────────────────────────────
-- MESSAGES
-- ─────────────────────────────────────────
create policy "messages_select"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

create policy "messages_insert"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    )
  );

-- ─────────────────────────────────────────
-- SURVEYS
-- ─────────────────────────────────────────
create policy "surveys_select"
  on public.surveys for select
  using (
    public.has_org_role(public.event_org_id(event_id), 'staff')
    or (status = 'active' and public.is_registered(event_id))
  );

create policy "surveys_insert"
  on public.surveys for insert
  with check (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "surveys_update"
  on public.surveys for update
  using (public.has_org_role(public.event_org_id(event_id), 'staff'));

create policy "surveys_delete"
  on public.surveys for delete
  using (public.has_org_role(public.event_org_id(event_id), 'admin'));

-- ─────────────────────────────────────────
-- SURVEY QUESTIONS
-- ─────────────────────────────────────────
create policy "survey_questions_select"
  on public.survey_questions for select
  using (
    exists (
      select 1 from public.surveys s
      where s.id = survey_id
        and (
          public.has_org_role(public.event_org_id(s.event_id), 'staff')
          or (s.status = 'active' and public.is_registered(s.event_id))
        )
    )
  );

create policy "survey_questions_insert"
  on public.survey_questions for insert
  with check (
    exists (
      select 1 from public.surveys s
      where s.id = survey_id
        and public.has_org_role(public.event_org_id(s.event_id), 'staff')
    )
  );

create policy "survey_questions_update"
  on public.survey_questions for update
  using (
    exists (
      select 1 from public.surveys s
      where s.id = survey_id
        and public.has_org_role(public.event_org_id(s.event_id), 'staff')
    )
  );

create policy "survey_questions_delete"
  on public.survey_questions for delete
  using (
    exists (
      select 1 from public.surveys s
      where s.id = survey_id
        and public.has_org_role(public.event_org_id(s.event_id), 'admin')
    )
  );

-- ─────────────────────────────────────────
-- SURVEY RESPONSES
-- ─────────────────────────────────────────
create policy "survey_responses_select"
  on public.survey_responses for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.surveys s
      where s.id = survey_id
        and public.has_org_role(public.event_org_id(s.event_id), 'staff')
    )
  );

create policy "survey_responses_insert"
  on public.survey_responses for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.surveys s
      where s.id = survey_id and s.status = 'active'
    )
  );

-- ─────────────────────────────────────────
-- SURVEY ANSWERS
-- ─────────────────────────────────────────
create policy "survey_answers_select"
  on public.survey_answers for select
  using (
    exists (
      select 1 from public.survey_responses sr
      join public.surveys s on s.id = sr.survey_id
      where sr.id = response_id
        and (
          sr.user_id = auth.uid()
          or public.has_org_role(public.event_org_id(s.event_id), 'staff')
        )
    )
  );

create policy "survey_answers_insert"
  on public.survey_answers for insert
  with check (
    exists (
      select 1 from public.survey_responses sr
      where sr.id = response_id and sr.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- AUDIT LOGS
-- ─────────────────────────────────────────
create policy "audit_logs_select"
  on public.audit_logs for select
  using (
    (org_id is not null and public.has_org_role(org_id, 'admin'))
    or (event_id is not null and public.has_org_role(public.event_org_id(event_id), 'admin'))
  );
