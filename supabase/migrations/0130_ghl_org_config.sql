-- Per-tenant GHL ID resolution (GE-8 Batch 1). Replaces the hardcoded
-- single-tenant constants in src/lib/integrations/ghl/config.ts with a
-- per-org table. Seeded here with SAUP's own values as row #1 so the
-- existing SAUP loop resolves byte-identically via getGhlOrgConfig.
create table public.ghl_org_config (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  pipeline_id text not null,
  stage_ids jsonb not null,
  field_ids jsonb not null,
  provisioned_by text not null default 'seed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ghl_org_config enable row level security;

create policy "ghl_org_config_select_service_only"
  on public.ghl_org_config for select to service_role using (true);

create policy "ghl_org_config_insert_service_only"
  on public.ghl_org_config for insert to service_role with check (true);

create policy "ghl_org_config_update_service_only"
  on public.ghl_org_config for update to service_role using (true) with check (true);

create policy "ghl_org_config_delete_service_only"
  on public.ghl_org_config for delete to service_role using (true);

-- No PUBLIC, no anon, no authenticated grants — implicit deny plus an
-- explicit revoke, since this table carries no per-row tenant filter.
revoke all on public.ghl_org_config from anon, authenticated;

-- Seed SAUP's row from the exact current values in config.ts. NOTE:
-- field_ids has 9 keys, not 8 — GHL_FIELD_KEYS in config.ts today is 7
-- contact fields (prezvaEventId..prezvaAttendeeLink) + prezvaCeCredits +
-- prezvaAttendancePct. Seeded verbatim from the source of truth.
insert into public.ghl_org_config (org_id, pipeline_id, stage_ids, field_ids, provisioned_by)
values (
  '22222222-2222-4222-8222-222222222201',
  'oTf46hAR05Cnms51VGeC',
  jsonb_build_object(
    'registered',         'd08d5780-342c-4a09-9cbf-7c0ab80eb4af',
    'paymentPending',     '5e0e12f8-6784-4293-94e5-39aeb3be66a5',
    'confirmed',          'e847ee8a-4296-4563-aa24-e6e89d99b844',
    'checkedIn',          '3c092619-1b13-48bd-83a2-d9f1e616e46f',
    'attendedSession',    '0ea76af1-8a73-4fa1-bd2d-0e71f36b2411',
    'noShow',              'cbfcb165-c227-4e1c-ae22-6d2cd8b9856c',
    'certificateIssued',  '8c559023-3634-47cb-b111-6827254bf9b6',
    'followUpComplete',   '5e067088-7278-44c4-9da6-3d09b350a96b'
  ),
  jsonb_build_object(
    'prezvaEventId',        'pZB1j7QMFIFzlvmbE4Om',
    'prezvaRegistrationId', 'xgwB65VeroEozIlRNyFS',
    'prezvaTicketType',     'kDw7hGlT9kp7lZbFLfLb',
    'prezvaPaymentStatus',  '6fyY04s1yyTmpic653C0',
    'prezvaSource',         'NfkhHIBJc3Etvq15iQnl',
    'prezvaLastSyncTime',   'bYbFHamdFhi4apJXhP9t',
    'prezvaAttendeeLink',   'GVx9yhZDVIkPChx7E5lp',
    'prezvaCeCredits',      '4mYrFTnrQvdMUQ19LMSt',
    'prezvaAttendancePct',  'jN0w8V3yMDLQaIJcp5pO'
  ),
  'seed'
)
on conflict (org_id) do nothing;
