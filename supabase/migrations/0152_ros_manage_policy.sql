-- 0152: run_of_show_items writes require run_of_show.manage (O115).
--
-- 0081's "ros_org_members" was FOR ALL on bare org membership, so any member of
-- the event's org (any role) could insert, edit or delete run-of-show items
-- directly through PostgREST. Reads stay membership-based; writes now need the
-- run_of_show.manage permission on the org that owns the row's event.
-- The MC hub (/mc/[token]) has no session and writes through a token-checked
-- server action with the service role, so it is unaffected.

DROP POLICY IF EXISTS "ros_org_members" ON public.run_of_show_items;

CREATE POLICY "ros_select_org_members" ON public.run_of_show_items
  FOR SELECT USING (
    public.is_org_member((SELECT e.org_id FROM public.events e WHERE e.id = run_of_show_items.event_id))
  );

CREATE POLICY "ros_insert_manage" ON public.run_of_show_items
  FOR INSERT WITH CHECK (
    public.has_permission((SELECT e.org_id FROM public.events e WHERE e.id = run_of_show_items.event_id), 'run_of_show.manage')
  );

CREATE POLICY "ros_update_manage" ON public.run_of_show_items
  FOR UPDATE
  USING (
    public.has_permission((SELECT e.org_id FROM public.events e WHERE e.id = run_of_show_items.event_id), 'run_of_show.manage')
  )
  WITH CHECK (
    public.has_permission((SELECT e.org_id FROM public.events e WHERE e.id = run_of_show_items.event_id), 'run_of_show.manage')
  );

CREATE POLICY "ros_delete_manage" ON public.run_of_show_items
  FOR DELETE USING (
    public.has_permission((SELECT e.org_id FROM public.events e WHERE e.id = run_of_show_items.event_id), 'run_of_show.manage')
  );
