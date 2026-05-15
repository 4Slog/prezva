-- B2-1: Add Stripe Connect capability columns to organizations
-- These are written by the account.updated webhook handler in /api/webhooks/stripe/route.ts

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payouts_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.charges_enabled IS 'Synced from Stripe account.updated webhook — true when org can accept card charges';
COMMENT ON COLUMN public.organizations.payouts_enabled IS 'Synced from Stripe account.updated webhook — true when Stripe can pay out to org bank account';
