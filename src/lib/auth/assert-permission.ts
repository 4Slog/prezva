import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/admin/gate'
import { PermissionError, OrgAccessError } from './permission-error'

export async function assertPermission(
  orgId: string,
  userId: string,
  permissionKey: string,
): Promise<void> {
  if (isSuperAdmin(userId)) return

  if (!orgId || !userId) throw new OrgAccessError()

  const supabase = createAdminClient()

  const { data: member, error: memberError } = await supabase
    .from('org_members')
    .select('role_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError || !member) throw new OrgAccessError()

  // Fail closed: null role_id means no RBAC roles seeded — deny all permissions.
  if (!member.role_id) throw new PermissionError(permissionKey)

  const { data: perm } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', member.role_id)
    .eq('permission_key', permissionKey)
    .maybeSingle()

  if (perm) return
  throw new PermissionError(permissionKey)
}

export async function hasPermission(
  orgId: string,
  userId: string,
  permissionKey: string,
): Promise<boolean> {
  try {
    await assertPermission(orgId, userId, permissionKey)
    return true
  } catch {
    return false
  }
}

export async function getOrgPermissions(orgId: string, userId: string): Promise<Set<string>> {
  if (isSuperAdmin(userId)) return new Set(['*'])

  if (!orgId || !userId) return new Set()

  const supabase = createAdminClient()

  const { data: member } = await supabase
    .from('org_members')
    .select('role_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!member?.role_id) return new Set()

  const { data: perms } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', member.role_id)

  return new Set((perms ?? []).map(p => p.permission_key))
}

export function permits(permSet: Set<string>, key: string): boolean {
  return permSet.has('*') || permSet.has(key)
}
