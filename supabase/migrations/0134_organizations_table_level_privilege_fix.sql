-- GE-8 security hardening follow-up: 0133 was a live no-op.
--
-- THE TRAP (read this before "simplifying" this migration):
-- A column-level REVOKE cannot carve columns out of a TABLE-level GRANT.
-- Postgres resolves column privileges as the UNION of (a) any column-level
-- grants naming that column and (b) any table-level grant, which implicitly
-- covers every column. Supabase grants INSERT/UPDATE/DELETE on every public
-- table to `anon` and `authenticated` at the TABLE level by default. 0133's
-- `revoke update (plan, entitled_until) ... from anon, authenticated` only
-- ever removed a column-level grant that didn't exist — the table-level
-- grant still covered those columns the whole time. Verified live against
-- information_schema.column_privileges: anon/authenticated retained
-- INSERT and UPDATE on organizations.plan and organizations.entitled_until
-- after 0133 was applied.
--
-- 0133 is SUPERSEDED by this migration. Its file is retained as repo ledger
-- (never delete migration files) but its REVOKE statements are dead: this
-- migration's table-level REVOKE already removes anon/authenticated's
-- ability to touch every column, plan/entitled_until included.
--
-- THE FIX: revoke the table-level grant entirely, then grant back ONLY the
-- specific columns the app's user-context (RLS-governed) write paths
-- actually use. Column privileges then become the sole source of truth —
-- no table-level grant remains to silently re-cover excluded columns.
--
-- Census (client-role write survey, src/): the only user-client
-- (createClient(), RLS-governed) writes to organizations are UPDATEs from
-- src/lib/orgs/actions.ts (updateOrg, UpdateOrgSchema) and
-- src/app/api/orgs/[id]/route.ts (PATCH) — together touching exactly the
-- 11 columns granted below. No user-client INSERT into organizations
-- exists anywhere in the codebase: org creation (create-organization.ts,
-- claim-actions.ts, admin onboard route) goes exclusively through
-- createAdminClient() / service_role, which is unaffected by these grants.
--
-- INSERT is therefore granted back to NOBODY. The `orgs_insert_authenticated`
-- RLS policy (auth.uid() is not null) is retained in place as harmless
-- defense-in-depth, but with zero column privileges backing it, it is now
-- unexercisable by anon or authenticated — this is deliberate, not an
-- oversight. If a future feature needs user-initiated org creation via the
-- RLS-governed client, grant the specific columns it needs at that time.
--
-- DELETE is intentionally left untouched. `orgs_delete_owner` (FOR DELETE
-- USING has_permission(id, 'org.delete')) is a live RLS policy with no
-- column-level surface to protect — row-level RLS is the entire safety
-- story for DELETE, unlike INSERT/UPDATE where plan/entitled_until needed
-- column-level protection against RLS-permitted-but-column-illegitimate
-- writes. Revoking table-level DELETE would break `orgs_delete_owner`
-- enforcement with no possible column-level grant-back to compensate.

revoke insert, update on public.organizations from anon, authenticated;

grant update (
  name, timezone, logo_url, website, email, description, phone, address, city, state, country
) on public.organizations to authenticated;
