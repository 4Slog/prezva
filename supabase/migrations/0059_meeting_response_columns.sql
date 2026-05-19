ALTER TABLE meeting_requests ADD COLUMN IF NOT EXISTS meeting_counter_time text;
ALTER TABLE meeting_requests ADD COLUMN IF NOT EXISTS meeting_counter_note text;
