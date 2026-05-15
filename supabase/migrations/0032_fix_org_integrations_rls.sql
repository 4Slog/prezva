-- B2-4: Fix org_integrations and integration_errors RLS
-- Replace USING (true) with org-scoped policies
-- Only org members can see their own org's integration config

-- org_integrations: drop open policy, add scoped policy
DROP POLICY IF EXISTS "org_integrations_service_only" ON public.org_integrations;

CREATE POLICY "org_integrations_org_members_only"
  ON public.org_integrations
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- integration_errors: drop open policy, add scoped policy
DROP POLICY IF EXISTS "integration_errors_service_only" ON public.integration_errors;

CREATE POLICY "integration_errors_org_members_only"
  ON public.integration_errors
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM public.org_members
      WHERE user_id = auth.uid()
    )
  );

-- Service role still bypasses RLS entirely (Supabase default) so backend server actions
-- using createAdminClient() are unaffected.
