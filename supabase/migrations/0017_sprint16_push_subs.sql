-- Web Push subscription storage for browser push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid REFERENCES registrations(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Org members can read subscriptions for their events
CREATE POLICY "org members can read push subs" ON push_subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM registrations r
      JOIN events e ON e.id = r.event_id
      JOIN org_members om ON om.org_id = e.org_id AND om.user_id = auth.uid()
      WHERE r.id = push_subscriptions.registration_id
    )
  );

-- Anyone can subscribe (registrants do not have org auth)
CREATE POLICY "anyone can subscribe" ON push_subscriptions
  FOR INSERT WITH CHECK (true);
