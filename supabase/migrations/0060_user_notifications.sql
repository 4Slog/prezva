CREATE TABLE IF NOT EXISTS user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('announcement','meeting_request','certificate','handout','match','follow','system')),
  title text NOT NULL,
  body text,
  url text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications(user_id, is_read, created_at DESC);

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own" ON user_notifications FOR ALL USING (auth.uid() = user_id);
