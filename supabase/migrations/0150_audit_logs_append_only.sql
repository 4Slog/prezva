-- O120: audit_logs is append-only by GRANT, not only by the absence of a policy.
-- All writes go through logAudit (src/lib/audit/log.ts) on the service-role
-- client. anon/authenticated keep no write path; authenticated keeps SELECT,
-- still gated by the audit_logs_select policy. service_role grants unchanged.
-- Revokes only: safe to re-run, no change to existing rows.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.audit_logs FROM anon, authenticated;
REVOKE SELECT ON public.audit_logs FROM anon;
