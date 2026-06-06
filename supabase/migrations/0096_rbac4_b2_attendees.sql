-- rbac4_b2_attendees: Swap has_org_role → has_permission for registrations/check_ins/offline_queue
-- Batch 2 of RBAC Phase 4 RLS cutover
--
-- Policy changes (9 policies):
--   registrations: SELECT attendees.view, UPDATE attendees.edit, DELETE attendees.refund
--   check_ins:     SELECT checkin.manage (+own-row preserved verbatim), INSERT checkin.manage
--   offline_queue: SELECT checkin.manage, INSERT checkin.manage, UPDATE checkin.manage
--
-- Staff preservation: checkin.manage kept → check_ins/offline_queue unchanged
-- Staff preservation: attendees.view+edit kept → registrations SELECT/UPDATE unchanged
-- registrations DELETE was already admin-only (has_org_role admin → has_permission attendees.refund)
-- registrations INSERT preserved verbatim (self-registration, no org_role check)

-- ── registrations ─────────────────────────────────────────────────────────────

DROP POLICY registrations_select ON registrations;
CREATE POLICY registrations_select ON registrations FOR SELECT
  USING (
    (user_id = auth.uid())
    OR has_permission(event_org_id(event_id), 'attendees.view')
  );

DROP POLICY registrations_update ON registrations;
CREATE POLICY registrations_update ON registrations FOR UPDATE
  USING (
    (user_id = auth.uid())
    OR has_permission(event_org_id(event_id), 'attendees.edit')
  );

DROP POLICY registrations_delete ON registrations;
CREATE POLICY registrations_delete ON registrations FOR DELETE
  USING (has_permission(event_org_id(event_id), 'attendees.refund'));

-- ── check_ins ─────────────────────────────────────────────────────────────────

DROP POLICY check_ins_select ON check_ins;
CREATE POLICY check_ins_select ON check_ins FOR SELECT
  USING (
    has_permission(event_org_id(event_id), 'checkin.manage')
    OR (EXISTS (
      SELECT 1 FROM registrations r
      WHERE r.id = check_ins.registration_id
        AND r.user_id = auth.uid()
    ))
  );

DROP POLICY check_ins_insert ON check_ins;
CREATE POLICY check_ins_insert ON check_ins FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'checkin.manage'));

-- ── offline_queue ─────────────────────────────────────────────────────────────

DROP POLICY offline_queue_select ON offline_queue;
CREATE POLICY offline_queue_select ON offline_queue FOR SELECT
  USING (has_permission(event_org_id(event_id), 'checkin.manage'));

DROP POLICY offline_queue_insert ON offline_queue;
CREATE POLICY offline_queue_insert ON offline_queue FOR INSERT
  WITH CHECK (has_permission(event_org_id(event_id), 'checkin.manage'));

DROP POLICY offline_queue_update ON offline_queue;
CREATE POLICY offline_queue_update ON offline_queue FOR UPDATE
  USING (has_permission(event_org_id(event_id), 'checkin.manage'));
