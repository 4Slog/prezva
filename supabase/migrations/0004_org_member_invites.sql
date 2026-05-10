-- org_member_invites: token-based invite system for org members
create table public.org_member_invites (
  id           uuid        primary key default gen_random_uuid(),
  org_id       uuid        not null references public.organizations(id) on delete cascade,
  email        text        not null,
  role         text        not null default 'member',
  token        text        not null unique,
  invited_by   uuid        not null references public.profiles(id),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.org_member_invites enable row level security;

-- Org members can view their org's pending invites
create policy "org_members_view_invites" on public.org_member_invites
  for select using (
    exists (
      select 1 from public.org_members
      where org_id = org_member_invites.org_id
        and user_id = auth.uid()
    )
  );

-- Only allow deleting your own org's invites (admin/owner enforced in app layer)
create policy "org_members_delete_invites" on public.org_member_invites
  for delete using (
    exists (
      select 1 from public.org_members
      where org_id = org_member_invites.org_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

create index idx_org_member_invites_org_id on public.org_member_invites(org_id);
create index idx_org_member_invites_token  on public.org_member_invites(token);
