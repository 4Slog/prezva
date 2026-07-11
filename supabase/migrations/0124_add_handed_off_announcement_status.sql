-- Add 'handed_off' to announcement_status.
-- Used for announcements on GHL-linked events: GoHighLevel owns email delivery,
-- so Prezva suppresses its Resend blast and marks the row handed_off (not sent).
-- Already applied to the live DB out-of-band via Supabase MCP; this file records
-- it in the repo ledger. Do NOT `supabase db push`.
ALTER TYPE announcement_status ADD VALUE IF NOT EXISTS 'handed_off';
