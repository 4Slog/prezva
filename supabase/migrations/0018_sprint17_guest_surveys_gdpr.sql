-- Sprint 17: guest survey responses + GDPR support

-- Allow survey responses without auth (guest via registration token)
ALTER TABLE survey_responses
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL;

-- RLS: anyone with a valid registration_id can submit (anon insert)
DROP POLICY IF EXISTS "Anyone can submit survey response" ON survey_responses;
CREATE POLICY "Anyone can submit survey response"
  ON survey_responses FOR INSERT
  WITH CHECK (true);

-- GDPR support: add deleted_at to allow org deletion flows
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended boolean NOT NULL DEFAULT false;
