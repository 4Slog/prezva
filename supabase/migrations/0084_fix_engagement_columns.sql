-- Fix engagement/badge feature columns that code references but were never created.
-- Live verification:
--   ticket_types.is_press       → missing; badge print SELECT errors → "No confirmed registrations found"
--   icebreaker_questions.created_at → missing; dashboard ORDER BY errors → page reads empty
--   trivia_questions.is_active  → missing; dashboard SELECT and setTriviaActive() error/no-op

ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS is_press boolean NOT NULL DEFAULT false;
ALTER TABLE icebreaker_questions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE trivia_questions ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
