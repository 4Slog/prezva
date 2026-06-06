-- rbac4_b1_agenda: Swap has_org_role → has_permission for events/sessions/tracks
-- Batch 1 of RBAC Phase 4 RLS cutover (64 policies across 26 tables)
-- Mapping source: rbac_phase4_rls_mapping.txt
--
-- Policy changes (10 policies):
--   events:   INSERT event.manage, UPDATE event.manage, DELETE event.manage
--   sessions: SELECT agenda.view, INSERT agenda.manage, UPDATE agenda.manage, DELETE event.manage
--   tracks:   INSERT agenda.manage, UPDATE agenda.manage, DELETE event.manage
--
-- Q1 tightening: sessions/tracks DELETE map to event.manage (owner/admin only).
-- Staff keeps agenda.manage → INSERT/UPDATE on sessions/tracks unchanged.
-- All other branches (is_published, event status, event_id IS NULL) preserved verbatim.

-- ── events ────────────────────────────────────────────────────────────────────

DROP POLICY events_insert_staff ON events;
CREATE POLICY events_insert_staff ON events FOR INSERT
  WITH CHECK (has_permission(org_id, 'event.manage'));

DROP POLICY events_update_staff ON events;
CREATE POLICY events_update_staff ON events FOR UPDATE
  USING (has_permission(org_id, 'event.manage'));

DROP POLICY events_delete_admin ON events;
CREATE POLICY events_delete_admin ON events FOR DELETE
  USING (has_permission(org_id, 'event.manage'));

-- ── sessions ──────────────────────────────────────────────────────────────────

DROP POLICY sessions_select ON sessions;
CREATE POLICY sessions_select ON sessions FOR SELECT
  USING (
    (
      (is_published = true)
      AND (EXISTS (
        SELECT 1 FROM events e
        WHERE e.id = sessions.event_id
          AND e.status = ANY (ARRAY['published'::event_status, 'live'::event_status, 'ended'::event_status])
      ))
    )
    OR has_permission(event_org_id(event_id), 'agenda.view')
  );

DROP POLICY sessions_insert ON sessions;
CREATE POLICY sessions_insert ON sessions FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'agenda.manage'));

DROP POLICY sessions_update ON sessions;
CREATE POLICY sessions_update ON sessions FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'agenda.manage'));

DROP POLICY sessions_delete ON sessions;
CREATE POLICY sessions_delete ON sessions FOR DELETE
  USING (has_permission(event_org_id(event_id), 'event.manage'));

-- ── tracks ────────────────────────────────────────────────────────────────────

DROP POLICY tracks_insert ON tracks;
CREATE POLICY tracks_insert ON tracks FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'agenda.manage'));

DROP POLICY tracks_update ON tracks;
CREATE POLICY tracks_update ON tracks FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'agenda.manage'));

DROP POLICY tracks_delete ON tracks;
CREATE POLICY tracks_delete ON tracks FOR DELETE
  USING (has_permission(event_org_id(event_id), 'event.manage'));
