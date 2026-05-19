CREATE TABLE IF NOT EXISTS session_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  is_active boolean DEFAULT false,
  show_results boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS session_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES session_polls(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  option_index int NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, user_id),
  UNIQUE(poll_id, registration_id)
);

ALTER TABLE session_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polls_read_public" ON session_polls FOR SELECT USING (true);
CREATE POLICY "votes_insert_auth" ON session_poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_read_public" ON session_poll_votes FOR SELECT USING (true);
