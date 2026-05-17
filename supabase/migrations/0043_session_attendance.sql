CREATE TABLE IF NOT EXISTS session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  checked_in_at timestamptz DEFAULT now(),
  checked_in_by uuid REFERENCES auth.users(id),
  UNIQUE(session_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_session_attendance_session_id ON session_attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_registration_id ON session_attendance(registration_id);
CREATE INDEX IF NOT EXISTS idx_session_attendance_event_id ON session_attendance(event_id);

ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage session attendance"
  ON session_attendance
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = session_attendance.event_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Attendees can view own session attendance"
  ON session_attendance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.id = session_attendance.registration_id
        AND r.user_id = auth.uid()
    )
  );
