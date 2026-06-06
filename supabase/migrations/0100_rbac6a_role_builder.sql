-- ============================================================
-- RBAC Phase 6a: Role-builder data layer
-- A. Grant org.roles.manage to admin built-in roles (×5 orgs)
-- B. role_org_id(uuid) helper function
-- C. roles: INSERT / UPDATE / DELETE RLS policies
-- D. role_permissions: INSERT / DELETE RLS policies (G1 + G2)
-- ============================================================

-- ── A. Grant org.roles.manage to admin ───────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_key)
  SELECT r.id, 'org.roles.manage'
  FROM roles r
  WHERE r.slug = 'admin' AND r.is_builtin = true
  ON CONFLICT DO NOTHING;

-- ── B. role_org_id helper ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.role_org_id(p_role_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM roles WHERE id = p_role_id
$$;

COMMENT ON FUNCTION public.role_org_id(uuid) IS
  'Resolve org_id from a role id. STABLE SECURITY DEFINER — mirrors event_org_id pattern.';

-- ── C. roles: INSERT / UPDATE / DELETE ───────────────────────────────────────

-- INSERT: manager can create custom roles only (is_builtin must be false)
CREATE POLICY roles_insert ON public.roles
  FOR INSERT
  WITH CHECK (
    public.has_permission(org_id, 'org.roles.manage')
    AND is_builtin = false
  );

-- UPDATE: manager can edit any non-owner role row (admin/staff names CAN be changed)
-- Fine-grained guards (can't flip is_builtin, can't change built-in slug) enforced in server action
CREATE POLICY roles_update ON public.roles
  FOR UPDATE
  USING (
    public.has_permission(org_id, 'org.roles.manage')
    AND slug <> 'owner'
  )
  WITH CHECK (
    public.has_permission(org_id, 'org.roles.manage')
    AND slug <> 'owner'
  );

-- DELETE: manager can delete custom roles only (is_builtin=false)
CREATE POLICY roles_delete ON public.roles
  FOR DELETE
  USING (
    public.has_permission(org_id, 'org.roles.manage')
    AND is_builtin = false
  );

-- ── D. role_permissions: INSERT / DELETE ─────────────────────────────────────

-- INSERT: G1 escalation guard (can't grant what you don't hold) + G2 owner-frozen
CREATE POLICY rp_insert ON public.role_permissions
  FOR INSERT
  WITH CHECK (
    public.has_permission(public.role_org_id(role_id), 'org.roles.manage')
    AND public.has_permission(public.role_org_id(role_id), permission_key)
    AND (SELECT slug FROM public.roles WHERE id = role_id) <> 'owner'
  );

-- DELETE: manager can remove permissions from any non-owner role
CREATE POLICY rp_delete ON public.role_permissions
  FOR DELETE
  USING (
    public.has_permission(public.role_org_id(role_id), 'org.roles.manage')
    AND (SELECT slug FROM public.roles WHERE id = role_id) <> 'owner'
  );
