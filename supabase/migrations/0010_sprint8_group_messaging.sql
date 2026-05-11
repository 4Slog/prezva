-- Sprint 8: Group messaging (T-092)

create table if not exists group_conversations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now()
);

create index if not exists group_conversations_event_idx on group_conversations(event_id);

create table if not exists group_conversation_members (
  conversation_id uuid not null references group_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  joined_at timestamptz default now(),
  primary key (conversation_id, user_id)
);

create index if not exists group_members_user_idx on group_conversation_members(user_id);

create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references group_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz default now()
);

create index if not exists group_messages_conversation_idx on group_messages(conversation_id);
create index if not exists group_messages_created_idx on group_messages(created_at desc);

-- RLS
alter table group_conversations enable row level security;
alter table group_conversation_members enable row level security;
alter table group_messages enable row level security;

create policy "service_role_all" on group_conversations for all to service_role using (true) with check (true);
create policy "service_role_all" on group_conversation_members for all to service_role using (true) with check (true);
create policy "service_role_all" on group_messages for all to service_role using (true) with check (true);
