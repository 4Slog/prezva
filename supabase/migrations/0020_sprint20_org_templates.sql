-- Sprint 20: org_templates — per-org saved templates across 6 authoring surfaces
create table if not exists org_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  surface      text not null check (surface in ('survey','badge','event','announcement','icebreaker','trivia')),
  name         text not null,
  description  text,
  payload      jsonb not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  usage_count  int not null default 0
);

create index if not exists org_templates_org_surface_idx on org_templates(org_id, surface);

alter table org_templates enable row level security;

-- Members can view their org's templates
create policy "org members can view templates"
  on org_templates for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_templates.org_id
        and org_members.user_id = auth.uid()
    )
  );

-- Org admins can insert templates
create policy "org admins can insert templates"
  on org_templates for insert
  with check (
    exists (
      select 1 from org_members
      where org_members.org_id = org_templates.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- Org admins can update templates
create policy "org admins can update templates"
  on org_templates for update
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_templates.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );

-- Org admins can delete templates
create policy "org admins can delete templates"
  on org_templates for delete
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = org_templates.org_id
        and org_members.user_id = auth.uid()
        and org_members.role in ('owner', 'admin')
    )
  );
