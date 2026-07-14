-- record_virtual_watch must be callable only by the server (service_role).
-- Supabase default privileges grant EXECUTE to anon+authenticated on new functions;
-- 0125's REVOKE ... FROM PUBLIC does not strip those explicit role grants.
REVOKE EXECUTE ON FUNCTION public.record_virtual_watch(uuid,uuid,uuid,integer) FROM anon, authenticated;
