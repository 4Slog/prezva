-- Ledger sync: both columns already exist live; ADD COLUMN IF NOT EXISTS is a no-op.
-- This migration only brings them into the committed migration ledger.
ALTER TABLE session_attendance ADD COLUMN IF NOT EXISTS watch_duration_seconds integer;
ALTER TABLE session_attendance ADD COLUMN IF NOT EXISTS source text DEFAULT 'in_person'::text;

-- Guarded, atomic, monotonic virtual watch-time upsert.
-- INSERT on first virtual view; ON CONFLICT keeps GREATEST (client sends running total).
-- WHERE guard makes the update a NO-OP when existing row has watch_duration_seconds IS NULL
-- (= in-person attendance) — never downgrades in-person credit to conditional virtual.
CREATE OR REPLACE FUNCTION record_virtual_watch(
  p_session_id uuid, p_registration_id uuid, p_event_id uuid, p_watched integer
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO session_attendance (session_id, registration_id, event_id, watch_duration_seconds, source)
  VALUES (p_session_id, p_registration_id, p_event_id, p_watched, 'virtual')
  ON CONFLICT (session_id, registration_id)
  DO UPDATE SET
    watch_duration_seconds = GREATEST(EXCLUDED.watch_duration_seconds, session_attendance.watch_duration_seconds),
    source = 'virtual'
  WHERE session_attendance.watch_duration_seconds IS NOT NULL;
$$;

-- Only service_role (server) may call this function — prevents direct-RPC forgery.
REVOKE ALL ON FUNCTION record_virtual_watch(uuid,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_virtual_watch(uuid,uuid,uuid,integer) TO service_role;
