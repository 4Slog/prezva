-- Fix passport tables RLS — was service_only which blocked all attendee access

-- passport_locations: public read for published events, org admin for writes
DROP POLICY IF EXISTS "passport_locations_service_only" ON passport_locations;

CREATE POLICY "passport_locations_read_public"
  ON passport_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e WHERE e.id = passport_locations.event_id
      AND e.status IN ('published', 'live')
    )
  );

CREATE POLICY "passport_locations_org_manage"
  ON passport_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = passport_locations.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = passport_locations.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- passport_visits: confirmed registrants can insert+read own, org members can read all
DROP POLICY IF EXISTS "passport_visits_service_only" ON passport_visits;

CREATE POLICY "passport_visits_own_read"
  ON passport_visits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "passport_visits_own_insert"
  ON passport_visits FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.event_id = passport_visits.event_id
        AND r.user_id = auth.uid()
        AND r.status = 'confirmed'
    )
  );

CREATE POLICY "passport_visits_org_read"
  ON passport_visits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      JOIN org_members om ON om.org_id = e.org_id
      WHERE e.id = passport_visits.event_id
        AND om.user_id = auth.uid()
    )
  );
