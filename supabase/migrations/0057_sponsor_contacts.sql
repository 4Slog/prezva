CREATE TABLE IF NOT EXISTS sponsor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES event_sponsors(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  portal_token uuid DEFAULT gen_random_uuid() UNIQUE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sponsor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sponsor_contacts_service_all" ON sponsor_contacts FOR ALL USING (true) WITH CHECK (true);
