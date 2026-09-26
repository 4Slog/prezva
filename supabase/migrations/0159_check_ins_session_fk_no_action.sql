-- O101 / F-R4: deleting a session that has check-ins is BLOCKED.
--
-- check_ins.session_id was ON DELETE SET NULL. A check_ins row with no session
-- IS a door check-in (check_ins_door_once), so hard-deleting a session turned
-- every session check-in into a fake door check-in — and F-R1 now certifies
-- zero-session events on exactly that row. (If the attendee already had a real
-- door check-in the SET NULL collided with the unique key and the delete failed
-- with 23505 instead.)
--
-- NO ACTION rather than RESTRICT: deleting an EVENT cascades to both sessions
-- and check_ins in one statement. NO ACTION checks at end of statement, after
-- the cascaded check-ins are gone, so event deletes keep working; RESTRICT
-- checks immediately and would depend on cascade order.
--
-- The app refuses the delete up front with "This session has check-ins —
-- unpublish it instead"; this constraint is the backstop (23503).

ALTER TABLE public.check_ins
  DROP CONSTRAINT IF EXISTS check_ins_session_id_fkey;

ALTER TABLE public.check_ins
  ADD CONSTRAINT check_ins_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE NO ACTION;
