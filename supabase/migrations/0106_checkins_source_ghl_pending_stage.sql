-- GE-5b.1: embed check-in source tracking + GHL pending stage self-heal

-- 1. check_ins.checked_in_by is already nullable per schema; no-op guard.
--    Add checked_in_source to distinguish dashboard vs embed vs offline vs self.
ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS checked_in_source text NOT NULL DEFAULT 'dashboard'
    CHECK (checked_in_source IN ('dashboard', 'embed', 'self', 'offline_sync'));

-- 2. ghl_sync_state: park the intended stage when the opportunity hasn't been created yet.
--    The create-sync job reads and applies this after the opportunity is born.
ALTER TABLE ghl_sync_state
  ADD COLUMN IF NOT EXISTS pending_stage_id text;
