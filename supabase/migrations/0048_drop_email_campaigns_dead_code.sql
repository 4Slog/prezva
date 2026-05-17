-- B8-5: Drop orphaned email_campaigns table
-- No UI, no send mechanism, no server action calls it.
-- Announcements system covers all email broadcast use cases.
DROP TABLE IF EXISTS public.email_campaigns;
