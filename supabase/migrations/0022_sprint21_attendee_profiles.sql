-- Sprint 21: user_profiles — cross-event identity (distinct from per-event attendee_profiles)
create table if not exists user_profiles (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  photo_url        text,
  bio              text,
  interests        text[] default array[]::text[],
  pronouns         text,
  linkedin_url     text,
  twitter_url      text,
  website_url      text,
  show_in_directory boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table user_profiles enable row level security;

create policy "owner can read/write own profile"
  on user_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "others can read public profiles"
  on user_profiles for select
  using (show_in_directory = true);

-- Sprint 21: attendee_preferences — notification + networking prefs
create table if not exists attendee_preferences (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  email_announcements        boolean not null default true,
  email_reminders            boolean not null default true,
  email_surveys              boolean not null default true,
  email_marketing            boolean not null default false,
  push_announcements         boolean not null default true,
  push_reminders             boolean not null default true,
  networking_show_in_dir     boolean not null default false,
  networking_accept_matches  boolean not null default true,
  networking_allow_dms       boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

alter table attendee_preferences enable row level security;

create policy "owner can read/write own preferences"
  on attendee_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
