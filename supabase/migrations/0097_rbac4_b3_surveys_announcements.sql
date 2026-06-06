-- rbac4_b3_surveys_announcements: Swap has_org_role → has_permission
-- Batch 3 of RBAC Phase 4 RLS cutover
--
-- Policy changes (15 policies, 6 attendee branches preserved verbatim):
--   surveys:           SELECT surveys.view, INSERT/UPDATE/DELETE surveys.manage
--   survey_questions:  SELECT surveys.view, INSERT/UPDATE/DELETE surveys.manage
--   survey_answers:    SELECT surveys.view  (INSERT own-response preserved)
--   survey_responses:  SELECT surveys.view  (INSERT policies preserved verbatim)
--   session_feedback:  SELECT surveys.view  (own_all + service_only preserved)
--   announcements:     SELECT announcements.manage, INSERT/UPDATE/DELETE announcements.send
--   ai_drafts_log:     SELECT announcements.manage
--
-- Staff loses: surveys.manage ops (INSERT/UPDATE/DELETE on surveys/survey_questions)
--              announcements.send ops (INSERT/UPDATE/DELETE on announcements)
-- Staff keeps: all .view reads + announcements.manage (SELECT + ai_drafts_log)

-- ── surveys ───────────────────────────────────────────────────────────────────

DROP POLICY surveys_select ON surveys;
CREATE POLICY surveys_select ON surveys FOR SELECT
  USING (
    has_permission(event_org_id(event_id), 'surveys.view')
    OR ((status = 'active'::survey_status) AND is_registered(event_id))
  );

DROP POLICY surveys_insert ON surveys;
CREATE POLICY surveys_insert ON surveys FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'surveys.manage'));

DROP POLICY surveys_update ON surveys;
CREATE POLICY surveys_update ON surveys FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'surveys.manage'));

DROP POLICY surveys_delete ON surveys;
CREATE POLICY surveys_delete ON surveys FOR DELETE
  USING (has_permission(event_org_id(event_id), 'surveys.manage'));

-- ── survey_questions ──────────────────────────────────────────────────────────

DROP POLICY survey_questions_select ON survey_questions;
CREATE POLICY survey_questions_select ON survey_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_questions.survey_id
        AND (
          has_permission(event_org_id(s.event_id), 'surveys.view')
          OR ((s.status = 'active'::survey_status) AND is_registered(s.event_id))
        )
    )
  );

DROP POLICY survey_questions_insert ON survey_questions;
CREATE POLICY survey_questions_insert ON survey_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_questions.survey_id
        AND has_permission(event_org_id(s.event_id), 'surveys.manage')
    )
  );

DROP POLICY survey_questions_update ON survey_questions;
CREATE POLICY survey_questions_update ON survey_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_questions.survey_id
        AND has_permission(event_org_id(s.event_id), 'surveys.manage')
    )
  );

DROP POLICY survey_questions_delete ON survey_questions;
CREATE POLICY survey_questions_delete ON survey_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_questions.survey_id
        AND has_permission(event_org_id(s.event_id), 'surveys.manage')
    )
  );

-- ── survey_answers ────────────────────────────────────────────────────────────
-- INSERT preserved verbatim (own-response: sr.user_id = auth.uid())

DROP POLICY survey_answers_select ON survey_answers;
CREATE POLICY survey_answers_select ON survey_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM (survey_responses sr
        JOIN surveys s ON (s.id = sr.survey_id))
      WHERE sr.id = survey_answers.response_id
        AND (
          sr.user_id = auth.uid()
          OR has_permission(event_org_id(s.event_id), 'surveys.view')
        )
    )
  );

-- ── survey_responses ──────────────────────────────────────────────────────────
-- INSERT policies ("Anyone can submit" + survey_responses_insert) preserved verbatim

DROP POLICY survey_responses_select ON survey_responses;
CREATE POLICY survey_responses_select ON survey_responses FOR SELECT
  USING (
    (user_id = auth.uid())
    OR (EXISTS (
      SELECT 1 FROM surveys s
      WHERE s.id = survey_responses.survey_id
        AND has_permission(event_org_id(s.event_id), 'surveys.view')
    ))
  );

-- ── session_feedback ──────────────────────────────────────────────────────────
-- session_feedback_own_all and session_feedback_service_only preserved verbatim

DROP POLICY session_feedback_staff_select ON session_feedback;
CREATE POLICY session_feedback_staff_select ON session_feedback FOR SELECT
  USING (has_permission(event_org_id(event_id), 'surveys.view'));

-- ── announcements ─────────────────────────────────────────────────────────────

DROP POLICY announcements_select ON announcements;
CREATE POLICY announcements_select ON announcements FOR SELECT
  USING (
    has_permission(event_org_id(event_id), 'announcements.manage')
    OR ((status = 'sent'::announcement_status) AND is_registered(event_id))
  );

DROP POLICY announcements_insert ON announcements;
CREATE POLICY announcements_insert ON announcements FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'announcements.send'));

DROP POLICY announcements_update ON announcements;
CREATE POLICY announcements_update ON announcements FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'announcements.send'));

DROP POLICY announcements_delete ON announcements;
CREATE POLICY announcements_delete ON announcements FOR DELETE
  USING (has_permission(event_org_id(event_id), 'announcements.send'));

-- ── ai_drafts_log ─────────────────────────────────────────────────────────────

DROP POLICY ai_drafts_log_select ON ai_drafts_log;
CREATE POLICY ai_drafts_log_select ON ai_drafts_log FOR SELECT
  USING (has_permission(org_id, 'announcements.manage'));
