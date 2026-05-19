ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sponsored_by_id uuid REFERENCES event_sponsors(id) ON DELETE SET NULL;
