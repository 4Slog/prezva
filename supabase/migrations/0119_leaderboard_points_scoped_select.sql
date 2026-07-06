-- Scope leaderboard_points reads to registered attendees of the row's event.
-- Replaces the unscoped USING(true) SELECT (migration 0050) that leaked all rows to anon.
-- service_role ALL policy (0087) stays; admin-client surfaces (organizer leaderboard,
-- lobby TV, event-home rank) bypass RLS and are unaffected.
DROP POLICY IF EXISTS "leaderboard_points_select_reg" ON leaderboard_points;

CREATE POLICY "leaderboard_points_attendee_select"
  ON leaderboard_points FOR SELECT
  USING (is_registered(event_id));
