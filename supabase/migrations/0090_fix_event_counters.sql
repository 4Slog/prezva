-- B5-002 root cause: update_checkin_count fires for ALL check-ins (event + session level)
-- causing checked_in_count to include session check-ins. Fix: only fire when session_id IS NULL.
CREATE OR REPLACE FUNCTION public.update_checkin_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.session_id IS NULL THEN
    UPDATE public.events
      SET checked_in_count = checked_in_count + 1
      WHERE id = NEW.event_id;
  END IF;
  RETURN NEW;
END;
$$;

-- B5-001 + B5-002: resync all stale cached counters to live truth
UPDATE public.events e
SET
  registration_count = (
    SELECT COUNT(*) FROM public.registrations r
    WHERE r.event_id = e.id
    AND r.status NOT IN ('cancelled', 'waitlisted', 'refunded')
  ),
  checked_in_count = (
    SELECT COUNT(*) FROM public.check_ins ci
    WHERE ci.event_id = e.id
    AND ci.session_id IS NULL
  );
