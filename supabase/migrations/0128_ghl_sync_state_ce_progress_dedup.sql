-- Dedup state for the CE-progress sweep (replay drip signals): only push
-- attendance%/CE-credits to the GHL opportunity when the value actually changed.
ALTER TABLE ghl_sync_state ADD COLUMN IF NOT EXISTS last_pushed_attendance_pct integer;
ALTER TABLE ghl_sync_state ADD COLUMN IF NOT EXISTS last_pushed_ce_credits numeric;
