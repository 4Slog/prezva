ALTER TABLE session_questions ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE session_questions ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
ALTER TABLE session_questions ADD COLUMN IF NOT EXISTS organizer_answer text;
