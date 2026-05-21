CREATE TABLE IF NOT EXISTS org_speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  job_title text,
  company text,
  bio text,
  photo_url text,
  website text,
  linkedin_url text,
  twitter_handle text,
  times_spoken int NOT NULL DEFAULT 0,
  last_spoken_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, email)
);

ALTER TABLE org_speakers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_speakers_org_members" ON org_speakers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_speakers.org_id
      AND org_members.user_id = auth.uid()
    )
  );
