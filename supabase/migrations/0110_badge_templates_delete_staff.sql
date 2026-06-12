-- Widen badge_templates DELETE policy to staff+ (parity with INSERT/UPDATE).
-- Also adds a second branch for org-library templates (event_id IS NULL) which
-- the old policy never covered (event join on NULL always fails → all deletes denied).
-- DO NOT apply directly — Desktop applies via Supabase MCP after code review.

DROP POLICY IF EXISTS "badge_templates_delete_org_admin" ON public.badge_templates;

CREATE POLICY "badge_templates_delete_org_staff"
  ON public.badge_templates
  FOR DELETE
  USING (
    -- event-bound templates: staff+ of the event's org
    (
      badge_templates.event_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.events e
        JOIN public.org_members om ON om.org_id = e.org_id
        WHERE e.id = badge_templates.event_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'staff')
      )
    )
    OR
    -- org-library templates (event_id IS NULL): staff+ of the template's org
    (
      badge_templates.event_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.org_members om
        WHERE om.org_id = badge_templates.org_id
          AND om.user_id = auth.uid()
          AND om.role IN ('owner', 'admin', 'staff')
      )
    )
  );
