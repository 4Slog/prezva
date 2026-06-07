-- Drop legacy has_org_role helper function.
-- Superseded by has_permission() (RBAC Phase 4). Confirmed 0 policies and
-- 0 other functions reference it before this drop.
DROP FUNCTION IF EXISTS public.has_org_role(uuid, org_role);
