-- rbac4_b4_speakers_qa: Swap has_org_role → has_permission for speakers/session_speakers/session_handouts/session_questions
-- Batch 4 of RBAC Phase 4 RLS cutover
--
-- Policy changes (11 policies):
--   speakers:          SELECT speakers.view, INSERT speakers.manage, UPDATE speakers.manage (+self-edit preserved), DELETE speakers.manage
--   session_speakers:  INSERT speakers.manage, DELETE speakers.manage  (SELECT uses is_org_member — untouched)
--   session_handouts:  SELECT speakers.view (+is_registered preserved)  (service_only — untouched)
--   session_questions: SELECT qa.view (+is_registered), INSERT qa.view (+auth.uid()=user_id+is_registered),
--                      UPDATE qa.moderate (+auth.uid()=user_id), DELETE qa.moderate (+auth.uid()=user_id)
--                      (service_only — untouched)
--
-- Staff loses: speakers.manage ops (speakers INSERT/UPDATE/DELETE, session_speakers INSERT/DELETE)
-- Staff keeps: speakers.view (SELECT), qa.view (SELECT/INSERT), qa.moderate (UPDATE/DELETE)
-- Self-edit branches preserved verbatim: speakers UPDATE (user_id=auth.uid()), session_questions UPDATE/DELETE (auth.uid()=user_id)

-- ── speakers ──────────────────────────────────────────────────────────────────

DROP POLICY speakers_select ON speakers;
CREATE POLICY speakers_select ON speakers FOR SELECT
  USING (
    (is_published = true)
    OR has_permission(event_org_id(event_id), 'speakers.view')
  );

DROP POLICY speakers_insert ON speakers;
CREATE POLICY speakers_insert ON speakers FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'speakers.manage'));

DROP POLICY speakers_update ON speakers;
CREATE POLICY speakers_update ON speakers FOR UPDATE
  USING (
    has_permission(event_org_id(event_id), 'speakers.manage')
    OR (user_id = auth.uid())
  );

DROP POLICY speakers_delete ON speakers;
CREATE POLICY speakers_delete ON speakers FOR DELETE
  USING (has_permission(event_org_id(event_id), 'speakers.manage'));

-- ── session_speakers ──────────────────────────────────────────────────────────
-- session_speakers_select uses is_org_member — preserved verbatim, not touched

DROP POLICY session_speakers_insert ON session_speakers;
CREATE POLICY session_speakers_insert ON session_speakers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_speakers.session_id
        AND has_permission(event_org_id(s.event_id), 'speakers.manage')
    )
  );

DROP POLICY session_speakers_delete ON session_speakers;
CREATE POLICY session_speakers_delete ON session_speakers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_speakers.session_id
        AND has_permission(event_org_id(s.event_id), 'speakers.manage')
    )
  );

-- ── session_handouts ──────────────────────────────────────────────────────────
-- session_handouts_service_only (true) preserved verbatim

DROP POLICY session_handouts_read_attendees_staff ON session_handouts;
CREATE POLICY session_handouts_read_attendees_staff ON session_handouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = session_handouts.session_id
        AND (
          is_registered(s.event_id)
          OR has_permission(event_org_id(s.event_id), 'speakers.view')
        )
    )
  );

-- ── session_questions ─────────────────────────────────────────────────────────
-- session_questions_service_only (true) preserved verbatim

DROP POLICY session_questions_attendee_select ON session_questions;
CREATE POLICY session_questions_attendee_select ON session_questions FOR SELECT
  USING (
    is_registered(event_id)
    OR has_permission(event_org_id(event_id), 'qa.view')
  );

DROP POLICY session_questions_attendee_insert ON session_questions;
CREATE POLICY session_questions_attendee_insert ON session_questions FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      is_registered(event_id)
      OR has_permission(event_org_id(event_id), 'qa.view')
    )
  );

DROP POLICY session_questions_owner_or_staff_update ON session_questions;
CREATE POLICY session_questions_owner_or_staff_update ON session_questions FOR UPDATE
  USING (
    (auth.uid() = user_id)
    OR has_permission(event_org_id(event_id), 'qa.moderate')
  );

DROP POLICY session_questions_owner_or_staff_delete ON session_questions;
CREATE POLICY session_questions_owner_or_staff_delete ON session_questions FOR DELETE
  USING (
    (auth.uid() = user_id)
    OR has_permission(event_org_id(event_id), 'qa.moderate')
  );
