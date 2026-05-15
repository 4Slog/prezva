-- B2-3: Add index on audit_logs.event_id for dashboard queries
-- Also adds a composite index for the most common query pattern: org + time range

CREATE INDEX IF NOT EXISTS audit_logs_event_id_idx ON public.audit_logs(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx ON public.audit_logs(org_id, created_at DESC);
