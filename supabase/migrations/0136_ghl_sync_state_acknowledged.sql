-- Sync-health visibility (embed lane, read-time only): lets an organizer
-- acknowledge a ghl_sync_state row once they've seen it, so it stops
-- coloring the sync-health pill. No retry/cron semantics — status stays
-- the state machine, acknowledged_at is purely a "seen it" marker.
alter table public.ghl_sync_state
  add column if not exists acknowledged_at timestamptz null;
