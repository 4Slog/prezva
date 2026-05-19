CREATE TABLE IF NOT EXISTS sponsor_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sponsor_id uuid NOT NULL REFERENCES event_sponsors(id) ON DELETE CASCADE,
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  attendee_name text,
  attendee_email text,
  company text,
  job_title text,
  note text,
  quality text DEFAULT 'warm' CHECK (quality IN ('hot','warm','cold')),
  scanned_by_contact_name text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sponsor_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sponsor_leads_service_all" ON sponsor_leads FOR ALL USING (true) WITH CHECK (true);
