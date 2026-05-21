CREATE TABLE IF NOT EXISTS volunteer_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  alert_type text NOT NULL CHECK (alert_type IN ('urgent','issue','question','info')),
  message text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE volunteer_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "volunteer_alerts_service" ON volunteer_alerts FOR ALL USING (true);
