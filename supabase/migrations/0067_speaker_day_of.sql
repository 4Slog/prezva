ALTER TABLE events ADD COLUMN IF NOT EXISTS speaker_day_of_info text;
ALTER TABLE speakers ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;
