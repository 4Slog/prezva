-- O155 / G-R2: org_integrations was FOR ALL to public for any org member, and
-- anon/authenticated held every table privilege, so any member of an org — of
-- any role, without org.integrations — could read the encrypted OAuth tokens
-- and insert, update or delete the org's integration rows (the GHL row
-- included) through the anon key.
--
-- Closed state:
--   * anon: nothing.
--   * authenticated: SELECT on the safe columns only, for orgs they belong to
--     (the dashboard pages show provider/status badges to any member).
--   * no client INSERT/UPDATE/DELETE: every write and every token read runs
--     server-side on the service role behind org.integrations (batch G1,
--     cd1668b, deployed before this migration).
--
-- Same shape as 0157/0158: revoke the table, grant back a column list built
-- from information_schema. Here the list is an allowlist, not "all but the
-- secrets", so a column added later stays service-only until granted.

REVOKE ALL ON public.org_integrations FROM anon, authenticated;

DO $$
DECLARE
  safe text[] := ARRAY['id', 'org_id', 'provider', 'status', 'scopes', 'last_synced_at',
                       'directionality_preferences', 'created_at', 'updated_at'];
  cols text;
  n int;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position), count(*)
    INTO cols, n
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'org_integrations'
     AND column_name = ANY (safe);

  IF n <> array_length(safe, 1) THEN
    RAISE EXCEPTION 'org_integrations: expected % safe columns, found %', array_length(safe, 1), n;
  END IF;

  EXECUTE format('GRANT SELECT (%s) ON public.org_integrations TO authenticated', cols);
END $$;

DROP POLICY IF EXISTS org_integrations_org_members_only ON public.org_integrations;

CREATE POLICY org_integrations_members_select ON public.org_integrations
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_members.org_id FROM public.org_members WHERE org_members.user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
