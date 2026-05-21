ALTER TABLE session_handouts ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE session_handouts ADD COLUMN IF NOT EXISTS is_latest boolean NOT NULL DEFAULT true;
ALTER TABLE session_handouts ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES session_handouts(id);
