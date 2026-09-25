-- O147 + R91: three more columns were readable by anyone holding the public
-- anon key, through the same RLS-visible rows 0157 dealt with:
--   events.registration_invite_code   the code that gates invite-only registration
--   events.ghl_creator_email          the GHL user who created the event
--   speakers.email                    every published speaker's email
--
-- Same fix as 0157: drop the table-level SELECT for anon/authenticated and
-- grant back every column except the service-only ones. Revoking the table
-- privilege also revokes 0157's column-level grants, so each list is rebuilt
-- from information_schema and must repeat 0157's secrets. RLS policies are
-- unchanged. The app reads these columns with the service role after an
-- authorization check (batch E1, deployed before this migration).
--
-- R91: speakers choose whether their email shows on the public speaker pages.
-- The switch is added BEFORE the grant so it is granted; existing speakers
-- start OFF. The email itself stays service-only either way — the public pages
-- merge it in server-side when the switch is on.
--
-- No values are re-minted: an organizer who wants a new invite code sets one.

ALTER TABLE public.speakers
  ADD COLUMN IF NOT EXISTS show_email_publicly boolean NOT NULL DEFAULT false;

DO $$
DECLARE
  spec record;
  cols text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('events',   ARRAY['mc_token', 'lobby_token', 'registration_invite_code', 'ghl_creator_email']),
      ('speakers', ARRAY['confirmation_token', 'portal_token_expires_at', 'email'])
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

NOTIFY pgrst, 'reload schema';
