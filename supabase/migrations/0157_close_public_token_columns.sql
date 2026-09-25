-- Security hotfix: bearer-token columns were readable by anyone holding the
-- public anon key, because the tables' RLS SELECT policies expose published
-- rows and the default table-level SELECT grant covers every column:
--   speakers.confirmation_token (+ portal_token_expires_at)  speaker portal
--   sessions.session_qr_token                                 remote session self check-in (CE credit)
--   events.mc_token, events.lobby_token                       MC hub, lobby display
--   event_sponsors.portal_access_token                        sponsor portal
--
-- Fix: drop the table-level SELECT for anon/authenticated and grant back every
-- column except the secret ones (a column-level REVOKE alone is a no-op
-- against the table grant — see 0133/0134). Lists are built from
-- information_schema at migration time so no column is missed. RLS policies
-- are unchanged; they still decide which rows are visible.
--
-- A column added to one of these tables later is NOT readable by anon /
-- authenticated until it is granted — add it to src/lib/db/public-columns.ts
-- and grant it in that migration.
--
-- Every existing token value is treated as leaked and re-minted in its
-- current format.

DO $$
DECLARE
  spec record;
  cols text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('speakers',       ARRAY['confirmation_token', 'portal_token_expires_at']),
      ('sessions',       ARRAY['session_qr_token']),
      ('events',         ARRAY['mc_token', 'lobby_token']),
      ('event_sponsors', ARRAY['portal_access_token'])
    ) AS t(tbl, secret)
  LOOP
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
      INTO cols
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = spec.tbl
       AND column_name <> ALL (spec.secret);

    EXECUTE format('REVOKE SELECT ON public.%I FROM anon, authenticated', spec.tbl);
    EXECUTE format('GRANT SELECT (%s) ON public.%I TO anon, authenticated', cols, spec.tbl);
  END LOOP;
END $$;

-- Re-mint every exposed token (same formats as the column defaults).
UPDATE public.speakers
   SET confirmation_token = encode(gen_random_bytes(24), 'hex')
 WHERE confirmation_token IS NOT NULL;

UPDATE public.sessions
   SET session_qr_token = encode(gen_random_bytes(16), 'hex')
 WHERE session_qr_token IS NOT NULL;

UPDATE public.events
   SET mc_token = CASE WHEN mc_token IS NOT NULL THEN gen_random_uuid() END,
       lobby_token = CASE WHEN lobby_token IS NOT NULL THEN gen_random_uuid() END
 WHERE mc_token IS NOT NULL OR lobby_token IS NOT NULL;

UPDATE public.event_sponsors
   SET portal_access_token = encode(gen_random_bytes(16), 'hex')
 WHERE portal_access_token IS NOT NULL;
