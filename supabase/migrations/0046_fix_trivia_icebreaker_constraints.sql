-- Fix 1: trivia_questions.body is NOT NULL but new inserts only use question_text
-- The body column is legacy — make it nullable so question_text can be the source of truth
ALTER TABLE trivia_questions ALTER COLUMN body DROP NOT NULL;
ALTER TABLE trivia_questions ALTER COLUMN body SET DEFAULT '';

-- Fix 2: icebreaker_questions RLS — allow org members of the event's org to insert
-- The current policy is too restrictive; org admins/owners should be able to seed prompts
DROP POLICY IF EXISTS "Org members can manage icebreaker_questions" ON icebreaker_questions;

CREATE POLICY "Org members can manage icebreaker_questions"
  ON icebreaker_questions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = icebreaker_questions.event_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = icebreaker_questions.event_id
        AND om.user_id = auth.uid()
    )
  );

-- Fix 3: icebreaker_questions.question (original NOT NULL col) — make nullable
-- The app inserts into question_text but table requires question; make both work
ALTER TABLE icebreaker_questions ALTER COLUMN question DROP NOT NULL;
ALTER TABLE icebreaker_questions ALTER COLUMN question SET DEFAULT '';
UPDATE icebreaker_questions SET question = COALESCE(question_text, prompt, '') WHERE question IS NULL;
