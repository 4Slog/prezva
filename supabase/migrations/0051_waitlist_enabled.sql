-- Add waitlist_enabled flag to ticket_types
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS waitlist_enabled boolean NOT NULL DEFAULT false;
