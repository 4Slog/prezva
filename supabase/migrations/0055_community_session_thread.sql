ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_posts_session_idx ON community_posts(session_id) WHERE session_id IS NOT NULL;
