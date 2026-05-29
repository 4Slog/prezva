-- Email suppression list — bounces and spam complaints from Resend webhooks.
-- Emails in this table are excluded from all outbound sends to protect domain reputation.
CREATE TABLE IF NOT EXISTS email_suppressions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  reason        text NOT NULL CHECK (reason IN ('bounce', 'complaint', 'manual')),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  raw_event     jsonb,
  CONSTRAINT email_suppressions_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS email_suppressions_email_idx ON email_suppressions (lower(email));
