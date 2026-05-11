-- Sprint 10: Engagement, Gamification, Certificates

-- Announcement depth (T-097, T-098, T-099)
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS audience_filter jsonb NOT NULL DEFAULT '{"types":[],"tags":[]}';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS exclude_filter jsonb NOT NULL DEFAULT '{"types":[],"tags":[]}';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;

-- Poll votes (T-100a)
CREATE TABLE IF NOT EXISTS poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES session_questions(id) ON DELETE CASCADE,
  option_index int NOT NULL,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poll_votes_service_only" ON poll_votes USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS poll_votes_question_idx ON poll_votes(question_id);

-- Poll templates (T-101)
CREATE TABLE IF NOT EXISTS poll_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'general',
  body text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE poll_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "poll_templates_read_all" ON poll_templates FOR SELECT USING (true);
CREATE POLICY "poll_templates_service_write" ON poll_templates FOR ALL USING (true) WITH CHECK (true);

-- Survey templates (T-101a)
CREATE TABLE IF NOT EXISTS survey_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  questions jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE survey_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "survey_templates_read_all" ON survey_templates FOR SELECT USING (true);
CREATE POLICY "survey_templates_service_write" ON survey_templates FOR ALL USING (true) WITH CHECK (true);

-- Session feedback (T-102)
CREATE TABLE IF NOT EXISTS session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_feedback_service_only" ON session_feedback USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS session_feedback_session_idx ON session_feedback(session_id);

-- Leaderboard points (T-104)
CREATE TABLE IF NOT EXISTS leaderboard_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  points int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leaderboard_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaderboard_points_service_only" ON leaderboard_points USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS leaderboard_points_event_user_idx ON leaderboard_points(event_id, user_id);

-- Photo contest (T-105)
CREATE TABLE IF NOT EXISTS photo_contest_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  caption text,
  storage_path text NOT NULL,
  vote_count int NOT NULL DEFAULT 0,
  is_winner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE photo_contest_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_contest_service_only" ON photo_contest_entries USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS photo_contest_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES photo_contest_entries(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, user_id)
);

ALTER TABLE photo_contest_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_contest_votes_service_only" ON photo_contest_votes USING (true) WITH CHECK (true);

-- Trivia contest (T-106)
CREATE TABLE IF NOT EXISTS trivia_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  body text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  correct_index int NOT NULL,
  points int NOT NULL DEFAULT 10,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trivia_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_questions_service_only" ON trivia_questions USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS trivia_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  answer_index int NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

ALTER TABLE trivia_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trivia_answers_service_only" ON trivia_answers USING (true) WITH CHECK (true);

-- Icebreaker completions (T-107)
CREATE TABLE IF NOT EXISTS icebreaker_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  question_id uuid NOT NULL REFERENCES icebreaker_questions(id) ON DELETE CASCADE,
  response text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, question_id)
);

ALTER TABLE icebreaker_completions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icebreaker_completions_service_only" ON icebreaker_completions USING (true) WITH CHECK (true);

-- Passport contest (T-108)
CREATE TABLE IF NOT EXISTS passport_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  points int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, code)
);

ALTER TABLE passport_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passport_locations_service_only" ON passport_locations USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS passport_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  location_id uuid NOT NULL REFERENCES passport_locations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id, location_id)
);

ALTER TABLE passport_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "passport_visits_service_only" ON passport_visits USING (true) WITH CHECK (true);

-- Certificates (T-109)
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS certificate_token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');

-- Email campaigns log
CREATE TABLE IF NOT EXISTS email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  subject text NOT NULL,
  body text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  sent_count int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_campaigns_service_only" ON email_campaigns USING (true) WITH CHECK (true);
