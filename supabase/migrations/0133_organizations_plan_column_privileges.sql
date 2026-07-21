-- GE-8 security hardening (Vuln 1, /security-review on 6e465e9): organizations.plan
-- and entitled_until gate paid features, but the table's existing RLS policies
-- (orgs_update_owner / orgs_insert_authenticated) are row-scoped only — RLS
-- cannot restrict which COLUMNS a permitted UPDATE/INSERT may touch. Without this,
-- any org owner/admin (has_permission(id, 'org.settings')) could self-grant
-- entitlement via a direct PostgREST call using their own anon-key session,
-- bypassing the app-layer zod whitelist entirely (that whitelist only protects
-- callers going through the Next.js server actions, not direct REST calls).
--
-- All legitimate writes to these two columns already go exclusively through
-- createAdminClient() (service_role) — see src/lib/orgs/create-organization.ts,
-- src/lib/embedded/claim-actions.ts, and any future billing/entitlement admin
-- tooling. Revoking the column privileges from anon/authenticated has no
-- legitimate-path fallout.
--
-- Explicit anon AND authenticated: REVOKE ... FROM PUBLIC does not strip
-- Supabase's own default grants to these two roles.
revoke update (plan, entitled_until) on public.organizations from anon, authenticated;
revoke insert (plan, entitled_until) on public.organizations from anon, authenticated;
