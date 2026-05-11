-- Sprint 8: Networking depth

-- Attendee profiles (T-091, T-091a, T-094d, T-094e)
create table if not exists attendee_profiles (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references registrations(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id),
  bio text,
  company text,
  job_title text,
  interests text[] default '{}',
  avatar_url text,
  linkedin_url text,
  twitter_url text,
  website_url text,
  is_visible boolean not null default true,
  icebreaker_answers jsonb default '{}',
  fts tsvector generated always as (
    to_tsvector('english',
      coalesce(bio, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(job_title, '') || ' ' ||
      coalesce(array_to_string(interests, ' '), '')
    )
  ) stored,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists attendee_profiles_event_idx on attendee_profiles(event_id);
create index if not exists attendee_profiles_fts_idx on attendee_profiles using gin(fts);
create index if not exists attendee_profiles_user_idx on attendee_profiles(user_id);

-- Meeting requests (T-094a, T-094c)
create table if not exists meeting_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  requester_id uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  message text,
  proposed_times jsonb default '[]',  -- array of ISO datetime strings
  meeting_at timestamptz,
  location text,
  status text not null default 'pending',  -- pending | accepted | declined | cancelled
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (event_id, requester_id, recipient_id)
);

create index if not exists meeting_requests_event_idx on meeting_requests(event_id);
create index if not exists meeting_requests_recipient_idx on meeting_requests(recipient_id);

-- Community posts (T-094b, T-094c, T-094f, T-094h, T-094i)
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  post_type text not null default 'post',  -- post | meetup | article
  body text,
  image_url text,
  article_url text,
  og_title text,
  og_description text,
  og_image text,
  location text,
  starts_at timestamptz,  -- for meetups
  is_pinned boolean not null default false,
  upvote_count int not null default 0,
  reply_count int not null default 0,
  rsvp_count int not null default 0,
  is_deleted boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists community_posts_event_idx on community_posts(event_id);
create index if not exists community_posts_author_idx on community_posts(author_id);
create index if not exists community_posts_created_idx on community_posts(created_at desc);

-- Community replies (T-094f)
create table if not exists community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  is_deleted boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists community_replies_post_idx on community_replies(post_id);

-- Community upvotes
create table if not exists community_upvotes (
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  primary key (post_id, user_id)
);

-- Meetup RSVPs (T-094b, T-094c)
create table if not exists community_rsvps (
  post_id uuid not null references community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);

-- Follow/unfollow attendees (T-094g)
create table if not exists attendee_follows (
  follower_id uuid not null references auth.users(id),
  followed_id uuid not null references auth.users(id),
  event_id uuid not null references events(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followed_id, event_id)
);

-- Icebreaker questions (T-094d) — seeded question bank
create table if not exists icebreaker_questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text default 'general',
  is_active boolean default true
);

-- Community moderation reports (T-094j)
create table if not exists community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  reply_id uuid references community_replies(id) on delete cascade,
  reporter_id uuid not null references auth.users(id),
  reason text not null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- RLS
alter table attendee_profiles enable row level security;
alter table meeting_requests enable row level security;
alter table community_posts enable row level security;
alter table community_replies enable row level security;
alter table community_upvotes enable row level security;
alter table community_rsvps enable row level security;
alter table attendee_follows enable row level security;
alter table icebreaker_questions enable row level security;
alter table community_reports enable row level security;

-- Service role full access
create policy "service_role_all" on attendee_profiles for all to service_role using (true) with check (true);
create policy "service_role_all" on meeting_requests for all to service_role using (true) with check (true);
create policy "service_role_all" on community_posts for all to service_role using (true) with check (true);
create policy "service_role_all" on community_replies for all to service_role using (true) with check (true);
create policy "service_role_all" on community_upvotes for all to service_role using (true) with check (true);
create policy "service_role_all" on community_rsvps for all to service_role using (true) with check (true);
create policy "service_role_all" on attendee_follows for all to service_role using (true) with check (true);
create policy "service_role_all" on icebreaker_questions for all to service_role using (true) with check (true);
create policy "service_role_all" on community_reports for all to service_role using (true) with check (true);

-- Seed icebreaker questions (T-094d)
insert into icebreaker_questions (question, category) values
  ('What''s one thing you''re hoping to learn at this event?', 'event'),
  ('What''s the best professional advice you''ve ever received?', 'career'),
  ('If you could have dinner with anyone, living or dead, who would it be?', 'fun'),
  ('What''s a side project you''re working on outside of work?', 'career'),
  ('What''s your go-to productivity tip?', 'career'),
  ('What book has had the biggest impact on you professionally?', 'career'),
  ('What''s one skill you''re currently working on improving?', 'career'),
  ('What''s the most interesting problem you''ve solved recently?', 'career'),
  ('What''s a trend in your industry you''re most excited about?', 'industry'),
  ('If you could switch careers for a day, what would you do?', 'fun')
on conflict do nothing;
