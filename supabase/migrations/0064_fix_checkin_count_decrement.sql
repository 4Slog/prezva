-- Fix: checked_in_count was only incremented on INSERT, not decremented on DELETE
-- This caused undo check-in to leave the counter stale

CREATE OR REPLACE FUNCTION decrement_checkin_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.events
    SET checked_in_count = GREATEST(0, checked_in_count - 1)
    WHERE id = OLD.event_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_checkin_count_delete
  AFTER DELETE ON public.check_ins
  FOR EACH ROW
  WHEN (OLD.session_id IS NULL)
  EXECUTE FUNCTION decrement_checkin_count();
