-- Sprint 9: Speaker Module
-- Tables: speaker_tokens, speaker_form_submissions, session_handouts, speaker_conversations, speaker_messages
-- Alterations: events.speaker_form_schema, session_questions (is_poll, poll_options, answered_at), speakers (status, confirmed_at, confirmation_token)

-- speaker_tokens: magic-link tokens for unauthenticated speaker portal
CREATE TABLE IF NOT EXISTS speaker_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, speaker_id)
);

ALTER TABLE speaker_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "speaker_tokens_service_only" ON speaker_tokens
  USING (true) WITH CHECK (true);

-- Add speaker_form_schema to events (organizer configures what info to collect from speakers)
ALTER TABLE events ADD COLUMN IF NOT EXISTS speaker_form_schema jsonb DEFAULT '[]';

-- speaker_form_submissions: speaker fills out the organizer-configured form
CREATE TABLE IF NOT EXISTS speaker_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, speaker_id)
);

ALTER TABLE speaker_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "speaker_form_submissions_service_only" ON speaker_form_submissions
  USING (true) WITH CHECK (true);

-- session_handouts: uploaded files linked to sessions
CREATE TABLE IF NOT EXISTS session_handouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  filename text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_handouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_handouts_service_only" ON session_handouts
  USING (true) WITH CHECK (true);

-- session_questions: Q&A and polls for sessions (T-072a + Sprint 9 extensions)
CREATE TABLE IF NOT EXISTS session_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  body text NOT NULL,
  upvote_count int NOT NULL DEFAULT 0,
  is_anonymous boolean NOT NULL DEFAULT false,
  is_poll boolean NOT NULL DEFAULT false,
  poll_options jsonb NOT NULL DEFAULT '[]',
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE session_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "session_questions_service_only" ON session_questions USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS session_questions_session_idx ON session_questions(session_id, created_at DESC);

-- speakers table: status + confirmation flow
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'invited';
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS confirmation_token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex');

-- speaker_conversations: 1-on-1 DM thread between organizer and speaker
CREATE TABLE IF NOT EXISTS speaker_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  speaker_id uuid NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, speaker_id)
);

ALTER TABLE speaker_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "speaker_conversations_service_only" ON speaker_conversations
  USING (true) WITH CHECK (true);

-- speaker_messages: messages within a speaker conversation
CREATE TABLE IF NOT EXISTS speaker_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES speaker_conversations(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('organizer', 'speaker')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE speaker_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "speaker_messages_service_only" ON speaker_messages
  USING (true) WITH CHECK (true);

-- indexes
CREATE INDEX IF NOT EXISTS speaker_tokens_token_idx ON speaker_tokens(token);
CREATE INDEX IF NOT EXISTS speaker_tokens_event_speaker_idx ON speaker_tokens(event_id, speaker_id);
CREATE INDEX IF NOT EXISTS session_handouts_session_idx ON session_handouts(session_id);
CREATE INDEX IF NOT EXISTS speaker_conversations_event_speaker_idx ON speaker_conversations(event_id, speaker_id);
CREATE INDEX IF NOT EXISTS speaker_messages_conversation_idx ON speaker_messages(conversation_id, created_at);
