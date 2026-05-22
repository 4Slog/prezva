ALTER TABLE events ADD COLUMN IF NOT EXISTS is_discoverable boolean NOT NULL DEFAULT false;
