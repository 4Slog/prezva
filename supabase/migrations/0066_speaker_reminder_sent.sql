ALTER TABLE session_speakers ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
