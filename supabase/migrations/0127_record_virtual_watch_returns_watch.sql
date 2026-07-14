-- record_virtual_watch must report prior/new watch duration so callers can detect
-- an 80% completion-threshold crossing without a second query. Postgres cannot
-- CREATE OR REPLACE a function with a changed return type, so DROP+CREATE.
DROP FUNCTION IF EXISTS public.record_virtual_watch(uuid,uuid,uuid,integer);

CREATE FUNCTION public.record_virtual_watch(
  p_session_id uuid, p_registration_id uuid, p_event_id uuid, p_watched integer
) RETURNS TABLE(prior_watched integer, new_watched integer) LANGUAGE sql AS $$
  WITH prior AS (
    SELECT watch_duration_seconds AS w FROM session_attendance
    WHERE session_id = p_session_id AND registration_id = p_registration_id
  ), up AS (
    INSERT INTO session_attendance (session_id, registration_id, event_id, watch_duration_seconds, source)
    VALUES (p_session_id, p_registration_id, p_event_id, p_watched, 'virtual')
    ON CONFLICT (session_id, registration_id)
    DO UPDATE SET
      watch_duration_seconds = GREATEST(EXCLUDED.watch_duration_seconds, session_attendance.watch_duration_seconds),
      source = 'virtual'
    WHERE session_attendance.watch_duration_seconds IS NOT NULL
    RETURNING watch_duration_seconds
  )
  SELECT (SELECT w FROM prior) AS prior_watched,
         COALESCE((SELECT watch_duration_seconds FROM up), (SELECT w FROM prior)) AS new_watched;
$$;

-- DROP+CREATE restores Supabase's default anon/authenticated grants — re-apply the
-- 0126 lockdown or this function silently reopens to non-service-role callers.
REVOKE ALL ON FUNCTION public.record_virtual_watch(uuid,uuid,uuid,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_virtual_watch(uuid,uuid,uuid,integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_virtual_watch(uuid,uuid,uuid,integer) TO service_role;
