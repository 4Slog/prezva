ALTER TABLE events ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE events ADD COLUMN IF NOT EXISTS category text
  CHECK (category IN ('conference','workshop','webinar','gala','training','networking','other'));
CREATE INDEX IF NOT EXISTS events_tags_gin ON events USING gin(tags);
CREATE INDEX IF NOT EXISTS events_city_idx ON events(venue_city, venue_state);
CREATE INDEX IF NOT EXISTS events_start_idx ON events(start_at, status);
