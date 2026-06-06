-- rbac4_b5_final: Swap has_org_role → has_permission — final batch (20 policies)
-- Batch 5 of RBAC Phase 4 RLS cutover
--
-- org_members:      INSERT/UPDATE org.members.invite; DELETE org.members.invite (+self-removal preserved)
-- organizations:    UPDATE org.settings (admin gains Q2); DELETE org.delete (owner-only, unchanged)
-- audit_logs:       SELECT dual-branch: org.audit_log + event.audit_log
-- discount_codes:   SELECT/INSERT/UPDATE/DELETE → event.tickets (staff loses)
-- ticket_types:     INSERT/UPDATE/DELETE → event.tickets (staff loses; SELECT uses is_org_member — untouched)
-- rooms:            INSERT/UPDATE/DELETE → video.manage (staff loses; SELECT uses is_org_member — untouched)
-- volunteers:       ALL → volunteers.manage (staff keeps)
-- dead_letter_items:ALL → (event_id IS NULL) OR failed_jobs.manage (staff loses; null branch preserved)
-- trivia_questions: SELECT → is_registered OR trivia.manage (staff keeps; service_only — untouched)

-- ── org_members ───────────────────────────────────────────────────────────────
-- org_members_select uses is_org_member — preserved verbatim

DROP POLICY org_members_insert ON org_members;
CREATE POLICY org_members_insert ON org_members FOR INSERT
  WITH CHECK (has_permission(org_id, 'org.members.invite'));

DROP POLICY org_members_update ON org_members;
CREATE POLICY org_members_update ON org_members FOR UPDATE
  USING (has_permission(org_id, 'org.members.invite'));

DROP POLICY org_members_delete ON org_members;
CREATE POLICY org_members_delete ON org_members FOR DELETE
  USING (
    has_permission(org_id, 'org.members.invite')
    OR (user_id = auth.uid())
  );

-- ── organizations ─────────────────────────────────────────────────────────────
-- orgs_select_member and orgs_insert_authenticated preserved verbatim (no has_org_role)

DROP POLICY orgs_update_owner ON organizations;
CREATE POLICY orgs_update_owner ON organizations FOR UPDATE
  USING (has_permission(id, 'org.settings'));

DROP POLICY orgs_delete_owner ON organizations;
CREATE POLICY orgs_delete_owner ON organizations FOR DELETE
  USING (has_permission(id, 'org.delete'));

-- ── audit_logs ────────────────────────────────────────────────────────────────

DROP POLICY audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (
    ((org_id IS NOT NULL) AND has_permission(org_id, 'org.audit_log'))
    OR ((event_id IS NOT NULL) AND has_permission(event_org_id(event_id), 'event.audit_log'))
  );

-- ── discount_codes ────────────────────────────────────────────────────────────

DROP POLICY discount_codes_select ON discount_codes;
CREATE POLICY discount_codes_select ON discount_codes FOR SELECT
  USING (has_permission(event_org_id(event_id), 'event.tickets'));

DROP POLICY discount_codes_insert ON discount_codes;
CREATE POLICY discount_codes_insert ON discount_codes FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'event.tickets'));

DROP POLICY discount_codes_update ON discount_codes;
CREATE POLICY discount_codes_update ON discount_codes FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'event.tickets'));

DROP POLICY discount_codes_delete ON discount_codes;
CREATE POLICY discount_codes_delete ON discount_codes FOR DELETE
  USING (has_permission(event_org_id(event_id), 'event.tickets'));

-- ── ticket_types ──────────────────────────────────────────────────────────────
-- ticket_types_select uses is_org_member + own-registration — preserved verbatim

DROP POLICY ticket_types_insert ON ticket_types;
CREATE POLICY ticket_types_insert ON ticket_types FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'event.tickets'));

DROP POLICY ticket_types_update ON ticket_types;
CREATE POLICY ticket_types_update ON ticket_types FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'event.tickets'));

DROP POLICY ticket_types_delete ON ticket_types;
CREATE POLICY ticket_types_delete ON ticket_types FOR DELETE
  USING (has_permission(event_org_id(event_id), 'event.tickets'));

-- ── rooms ─────────────────────────────────────────────────────────────────────
-- rooms_select uses is_org_member — preserved verbatim

DROP POLICY rooms_insert ON rooms;
CREATE POLICY rooms_insert ON rooms FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'video.manage'));

DROP POLICY rooms_update ON rooms;
CREATE POLICY rooms_update ON rooms FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'video.manage'));

DROP POLICY rooms_delete ON rooms;
CREATE POLICY rooms_delete ON rooms FOR DELETE
  USING (has_permission(event_org_id(event_id), 'video.manage'));

-- ── volunteers ────────────────────────────────────────────────────────────────

DROP POLICY volunteers_org_staff ON volunteers;
CREATE POLICY volunteers_org_staff ON volunteers FOR ALL
  USING (has_permission(event_org_id(event_id), 'volunteers.manage'))
  WITH CHECK (has_permission(event_org_id(event_id), 'volunteers.manage'));

-- ── dead_letter_items ─────────────────────────────────────────────────────────

DROP POLICY dead_letter_org_staff ON dead_letter_items;
CREATE POLICY dead_letter_org_staff ON dead_letter_items FOR ALL
  USING (
    (event_id IS NULL)
    OR has_permission(event_org_id(event_id), 'failed_jobs.manage')
  )
  WITH CHECK (
    (event_id IS NULL)
    OR has_permission(event_org_id(event_id), 'failed_jobs.manage')
  );

-- ── trivia_questions ──────────────────────────────────────────────────────────
-- trivia_questions_service_only (true) preserved verbatim

DROP POLICY trivia_questions_attendee_select ON trivia_questions;
CREATE POLICY trivia_questions_attendee_select ON trivia_questions FOR SELECT
  USING (
    is_registered(event_id)
    OR has_permission(event_org_id(event_id), 'trivia.manage')
  );
