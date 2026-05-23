CREATE TABLE IF NOT EXISTS run_of_show_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  time_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 5,
  title text NOT NULL,
  description text,
  responsible_person text,
  responsible_email text,
  status text NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','in_progress','done','skipped')),
  cue_notification_sent boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE run_of_show_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ros_org_members" ON run_of_show_items FOR ALL USING (
  EXISTS (
    SELECT 1 FROM events e
    JOIN org_members om ON om.org_id = e.org_id
    WHERE e.id = run_of_show_items.event_id
    AND om.user_id = auth.uid()
  )
);
