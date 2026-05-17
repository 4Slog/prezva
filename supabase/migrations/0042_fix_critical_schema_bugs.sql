-- Fix critical schema bugs found during stress test (May 2026)

-- Fix 1: icebreaker_questions missing event_id and question_text
-- seedIcebreakerPrompts() inserts event_id + question_text but neither column existed
ALTER TABLE icebreaker_questions ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE CASCADE;
ALTER TABLE icebreaker_questions ADD COLUMN IF NOT EXISTS question_text text;
UPDATE icebreaker_questions SET question_text = question WHERE question_text IS NULL;

-- Fix 2: trivia_questions missing category + difficulty
-- seedTriviaQuestions() inserts category + difficulty but table only had body/options/correct_index
ALTER TABLE trivia_questions ADD COLUMN IF NOT EXISTS question_text text;
ALTER TABLE trivia_questions ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
ALTER TABLE trivia_questions ADD COLUMN IF NOT EXISTS difficulty text DEFAULT 'medium';
UPDATE trivia_questions SET question_text = body WHERE question_text IS NULL;

-- Fix 3: announcements missing segment column
-- createAnnouncement() inserts segment but column was never added
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS segment text;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
