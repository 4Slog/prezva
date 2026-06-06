-- rbac4_has_permission: Create fail-closed permission check function for RLS policies
-- Phase 4 Batch 0B: additive-only, no policy changes

CREATE OR REPLACE FUNCTION public.has_permission(
  p_org_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM org_members m
    JOIN role_permissions rp ON rp.role_id = m.role_id
    WHERE m.org_id   = p_org_id
      AND m.user_id  = auth.uid()
      AND rp.permission_key = p_permission_key
  );
$$;

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'Fail-closed: no role_id, no grant, or unknown key returns false. No super-admin bypass at RLS layer (super-admins use service_role which bypasses RLS entirely).';
