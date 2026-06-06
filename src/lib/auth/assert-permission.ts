import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/admin/gate'

// Phase 4 removable: minimal fallback for the edge case where role_id IS NULL.
// Phase 1 verified 0 NULL role_ids exist; this only fires on a data anomaly.
function nullRoleIdFallback(role: string, permissionKey: string): boolean {
  if (role === 'owner') return true
  if (role === 'admin') {
    const ownerOnlyPrefixes = ['org.billing', 'org.delete', 'org.roles.manage']
    return !ownerOnlyPrefixes.some(p => permissionKey.startsWith(p))
  }
  // staff: deny and log — Phase 1 verified 0 NULL role_ids, should never fire
  console.warn(`[assertPermission] NULL role_id for staff role, denying ${permissionKey}`)
  return false
}

export async function assertPermission(
  orgId: string,
  userId: string,
  permissionKey: string,
): Promise<void> {
  if (isSuperAdmin(userId)) return

  if (!orgId || !userId) throw new Error('Insufficient permissions: missing org or user')

  const supabase = createAdminClient()

  const { data: member, error: memberError } = await supabase
    .from('org_members')
    .select('role_id, role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (memberError || !member) throw new Error('Not a member of this organization')

  if (member.role_id) {
    const { data: perm } = await supabase
      .from('role_permissions')
      .select('permission_key')
      .eq('role_id', member.role_id)
      .eq('permission_key', permissionKey)
      .maybeSingle()

    if (perm) return
    throw new Error(`Insufficient permissions: ${permissionKey}`)
  }

  // Phase 4 removable: NULL role_id fallback
  if (!nullRoleIdFallback(member.role as string, permissionKey)) {
    throw new Error(`Insufficient permissions: ${permissionKey}`)
  }
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
