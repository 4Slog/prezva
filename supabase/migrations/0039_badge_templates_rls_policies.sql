-- Badge templates RLS policies
-- Previously only had service_role policy — org members couldn't insert/update/delete

CREATE POLICY "badge_templates_select_org_members"
  ON public.badge_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.org_members om ON om.org_id = e.org_id
      WHERE e.id = badge_templates.event_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "badge_templates_insert_org_staff"
  ON public.badge_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.org_members om ON om.org_id = e.org_id
      WHERE e.id = badge_templates.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'staff')
    )
  );

CREATE POLICY "badge_templates_update_org_staff"
  ON public.badge_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.org_members om ON om.org_id = e.org_id
      WHERE e.id = badge_templates.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'staff')
    )
  );

CREATE POLICY "badge_templates_delete_org_admin"
  ON public.badge_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.org_members om ON om.org_id = e.org_id
      WHERE e.id = badge_templates.event_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );
