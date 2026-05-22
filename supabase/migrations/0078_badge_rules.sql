ALTER TABLE events ADD COLUMN IF NOT EXISTS badge_rules jsonb DEFAULT '[]'::jsonb;
