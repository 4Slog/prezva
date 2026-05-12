-- Sprint 22: certificate infrastructure

create table if not exists certificate_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- only one default per org
create unique index if not exists certificate_templates_one_default_per_org
  on certificate_templates(org_id) where is_default;

alter table events
  add column if not exists certificate_enabled boolean not null default false,
  add column if not exists certificate_min_session_attendance_pct int not null default 60,
  add column if not exists certificate_template_id uuid references certificate_templates(id);

alter table sessions
  add column if not exists ce_credit_hours numeric(5,2) default 0;

create table if not exists issued_certificates (
  id                 uuid primary key default gen_random_uuid(),
  registration_id    uuid not null references registrations(id) on delete cascade,
  event_id           uuid not null references events(id),
  template_id        uuid not null references certificate_templates(id),
  ce_credit_hours    numeric(5,2) not null default 0,
  sessions_attended  int not null default 0,
  pdf_url            text,
  pdf_generated_at   timestamptz,
  emailed_at         timestamptz,
  verification_id    text unique not null default encode(gen_random_bytes(8), 'hex'),
  created_at         timestamptz not null default now()
);

alter table certificate_templates enable row level security;
alter table issued_certificates enable row level security;

-- certificate_templates: org members can read; org admins can write
create policy "org members can read cert templates"
  on certificate_templates for select
  using (
    org_id in (
      select org_id from org_members where user_id = auth.uid()
    )
  );

create policy "org admins can manage cert templates"
  on certificate_templates for all
  using (
    org_id in (
      select org_id from org_members where user_id = auth.uid() and role in ('owner','admin')
    )
  )
  with check (
    org_id in (
      select org_id from org_members where user_id = auth.uid() and role in ('owner','admin')
    )
  );

-- issued_certificates: owner reads own; org staff reads org's; public reads via verification_id (separate query)
create policy "attendee reads own certificate"
  on issued_certificates for select
  using (
    registration_id in (
      select id from registrations where user_id = auth.uid()
    )
  );

create policy "org staff reads event certificates"
  on issued_certificates for select
  using (
    event_id in (
      select id from events where org_id in (
        select org_id from org_members where user_id = auth.uid()
      )
    )
  );

create policy "system inserts certificates"
  on issued_certificates for insert
  with check (true);

create policy "system updates certificates"
  on issued_certificates for update
  using (true)
  with check (true);
