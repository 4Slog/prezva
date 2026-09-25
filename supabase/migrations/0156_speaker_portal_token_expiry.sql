-- O139 / D-R3: speaker portal links (speakers.confirmation_token) never
-- expired. A link is now valid while
--   now() <= greatest(portal_token_expires_at, coalesce(end_at, start_at) + 30 days)
-- The event-derived bound means moving the event later never breaks a link;
-- portal_token_expires_at only ever extends it (a renew/invite after the
-- window sets it to now() + 7 days). The rule lives in
-- src/lib/speaker/speaker-link.ts.

ALTER TABLE public.speakers ADD COLUMN IF NOT EXISTS portal_token_expires_at timestamptz;

UPDATE public.speakers s
SET portal_token_expires_at = coalesce(e.end_at, e.start_at) + interval '30 days'
FROM public.events e
WHERE e.id = s.event_id
  AND s.confirmation_token IS NOT NULL
  AND s.portal_token_expires_at IS NULL;
