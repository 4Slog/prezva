-- Add membership_required flag to ticket_types for association-gated tickets
ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS membership_required boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN ticket_types.membership_required IS 'When true, registration requires active membership via a connected association integration';
