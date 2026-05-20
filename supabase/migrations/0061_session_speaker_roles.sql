ALTER TABLE session_speakers ADD COLUMN IF NOT EXISTS role text
  NOT NULL DEFAULT 'presenter'
  CHECK (role IN ('presenter','moderator','panelist','co-presenter','discussant','introducer'));
