-- SSO replay-nonce ledger (GE-8 hardening). One row per successfully-decrypted
-- SSO payload hash — the primary key is the atomic replay guard: an insert-first
-- claim means two concurrent requests carrying the same payload can't both "win."
create table public.sso_nonces (
  payload_hash text primary key,
  created_at timestamptz not null default now()
);

alter table public.sso_nonces enable row level security;

create policy "sso_nonces_select_service_only"
  on public.sso_nonces for select to service_role using (true);

create policy "sso_nonces_insert_service_only"
  on public.sso_nonces for insert to service_role with check (true);

create policy "sso_nonces_update_service_only"
  on public.sso_nonces for update to service_role using (true) with check (true);

create policy "sso_nonces_delete_service_only"
  on public.sso_nonces for delete to service_role using (true);

-- No PUBLIC, no anon, no authenticated grants — implicit deny plus an
-- explicit revoke, since this table carries no per-row tenant filter.
revoke all on public.sso_nonces from anon, authenticated;
