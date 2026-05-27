-- Prevent duplicate registrations for same email+event
-- Partial index: allows re-registration after cancellation/waitlist
CREATE UNIQUE INDEX IF NOT EXISTS registrations_event_email_unique
  ON registrations (event_id, lower(attendee_email))
  WHERE status NOT IN ('cancelled', 'waitlisted');
