ALTER TABLE speakers ADD COLUMN IF NOT EXISTS event_role text
  NOT NULL DEFAULT 'speaker'
  CHECK (event_role IN ('speaker','mc','chair','host','guest','vip'));
