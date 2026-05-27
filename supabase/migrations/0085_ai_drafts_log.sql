-- AI drafting usage log: one row per draft generation.
-- Used to enforce per-org daily rate limits (currently 20/day in app code).

create table if not exists ai_drafts_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  surface text not null check (surface in ('announcement', 'email', 'sms')),
  prompt_chars int not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_drafts_log_org_day_idx
  on ai_drafts_log (org_id, created_at);

alter table ai_drafts_log enable row level security;

-- Only staff+ can read their org's logs (for future debugging UI).
create policy ai_drafts_log_select on ai_drafts_log for select
  using (has_org_role(org_id, 'staff'::org_role));

-- Inserts are made by server actions via the admin client, so no anon policy
-- is needed; deliberately restrictive.
