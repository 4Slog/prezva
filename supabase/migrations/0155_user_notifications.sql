-- O144: in-app notifications. 0060 created this table but was never applied in
-- production, so every insert and read failed silently. Same shape as 0060,
-- with the type list narrowed to the values real writers use:
--   announcement        src/lib/announcements/in-app.ts (all announcement paths)
--   certificate         src/lib/certificates/issue-core.ts
--   video_chat_request  src/lib/video/actions.ts
-- Inserts come only from the service role (no INSERT policy). A signed-in user
-- reads their own rows and may flip is_read on them — nothing else.
--
-- Written to converge whether or not 0060 ran first (fresh databases replay
-- 0060 and would otherwise keep its CHECK, nullable columns and FOR ALL policy).

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_type_check
  CHECK (type IN ('announcement','certificate','video_chat_request'));

UPDATE public.user_notifications SET is_read = false WHERE is_read IS NULL;
UPDATE public.user_notifications SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.user_notifications
  ALTER COLUMN is_read SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

-- One notice per account per announcement: a reclaimed (stale) announcement
-- run re-inserts with ON CONFLICT DO NOTHING instead of duplicating. NULLs are
-- distinct, so certificate / video rows are unaffected.
ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS announcement_id uuid REFERENCES public.announcements(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_user_announcement_key
  ON public.user_notifications (user_id, announcement_id);

CREATE INDEX IF NOT EXISTS user_notifications_user_idx
  ON public.user_notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_own" ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_select_own ON public.user_notifications;
DROP POLICY IF EXISTS user_notifications_update_own ON public.user_notifications;

CREATE POLICY user_notifications_select_own ON public.user_notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY user_notifications_update_own ON public.user_notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Table-level UPDATE would let a user rewrite title/url/user_id on their own
-- rows; a column REVOKE alone is a no-op against it (see 0133/0134), so drop
-- the table grant first, then grant the one column back.
REVOKE UPDATE ON public.user_notifications FROM authenticated;
GRANT UPDATE (is_read) ON public.user_notifications TO authenticated;
-- TRUNCATE bypasses RLS entirely; REFERENCES/TRIGGER are never needed here.
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_notifications FROM authenticated;
REVOKE ALL ON public.user_notifications FROM anon;

-- Backfill: /me/notifications used to list sent announcements straight from
-- `announcements`; it now reads this table, so seed it with the history
-- (already read — no unread-badge flood). Same audience as the live path:
-- confirmed registrations with an account, honouring ticket-type targeting.
INSERT INTO public.user_notifications (user_id, type, title, body, url, is_read, created_at, announcement_id)
SELECT DISTINCT ON (r.user_id, a.id)
  r.user_id, 'announcement', a.title, left(a.body, 120),
  'https://prezva.app/e/' || e.slug, true, coalesce(a.sent_at, a.updated_at, now()), a.id
FROM public.announcements a
JOIN public.events e ON e.id = a.event_id
JOIN public.registrations r ON r.event_id = a.event_id AND r.status = 'confirmed' AND r.user_id IS NOT NULL
WHERE a.status IN ('sent', 'handed_off')
  AND (
    coalesce(jsonb_array_length(a.audience_filter -> 'types'), 0) = 0
    OR coalesce(r.ticket_type_id::text, '') IN (SELECT jsonb_array_elements_text(a.audience_filter -> 'types'))
  )
  AND coalesce(r.ticket_type_id::text, '') NOT IN (
    SELECT jsonb_array_elements_text(coalesce(a.exclude_filter -> 'types', '[]'::jsonb))
  )
ON CONFLICT (user_id, announcement_id) DO NOTHING;
