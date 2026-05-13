-- Sprint 25: Sponsor module, attendee points, community photos, icebreaker column fix

-- Event sponsors
CREATE TABLE IF NOT EXISTS event_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  website_url text,
  logo_url text,
  tier text NOT NULL DEFAULT 'bronze' CHECK (tier IN ('title','gold','silver','bronze')),
  sort_order int NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE event_sponsors ENABLE ROW LEVEL SECURITY;
-- Anon can read sponsors for published events
CREATE POLICY "event_sponsors_read_published" ON event_sponsors
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM events WHERE id = event_sponsors.event_id AND status IN ('published','live','ended'))
  );
-- Org members can manage
CREATE POLICY "event_sponsors_org_member_all" ON event_sponsors
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = event_sponsors.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = event_sponsors.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner','admin')
    )
  );

-- Attendee points (gamification leaderboard)
CREATE TABLE IF NOT EXISTS attendee_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  total_points int NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);
ALTER TABLE attendee_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendee_points_read_all" ON attendee_points FOR SELECT USING (true);
CREATE POLICY "attendee_points_service_all" ON attendee_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Community photos (photo contest)
CREATE TABLE IF NOT EXISTS community_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  caption text,
  votes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE community_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "community_photos_read_all" ON community_photos FOR SELECT USING (true);
CREATE POLICY "community_photos_insert_auth" ON community_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_photos_delete_own" ON community_photos FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "community_photos_service_all" ON community_photos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Fix icebreaker_questions: add prompt column as alias if not present
-- (The schema used 'question' but the app queries 'prompt')
ALTER TABLE icebreaker_questions ADD COLUMN IF NOT EXISTS prompt text;
UPDATE icebreaker_questions SET prompt = question WHERE prompt IS NULL;
