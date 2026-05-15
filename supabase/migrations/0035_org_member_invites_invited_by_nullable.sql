-- B2-8 followup: make invited_by nullable on org_member_invites
-- The original schema had NOT NULL, but system-created invites (admin onboarding)
-- have no human inviter. The onboard route sets invited_by = null for these rows.

ALTER TABLE public.org_member_invites
  ALTER COLUMN invited_by DROP NOT NULL;
