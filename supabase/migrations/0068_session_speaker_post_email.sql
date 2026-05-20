ALTER TABLE session_speakers ADD COLUMN IF NOT EXISTS post_session_email_sent_at timestamptz;
