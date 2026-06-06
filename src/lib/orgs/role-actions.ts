'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission, getOrgPermissions, permits } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { revalidatePath } from 'next/cache'

type OrgRole = 'owner' | 'admin' | 'staff'

const BUILTIN_SLUGS = new Set(['owner', 'admin', 'staff'])
const ENUM_ROLES: OrgRole[] = ['owner', 'admin', 'staff']

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ── createRole ────────────────────────────────────────────────────────────────

export async function createRole(
  orgId: string,
  name: string,
): Promise<{ role: { id: string; name: string; slug: string } } | { error: string }> {
  const user = await requireUser()
  const admin = createAdminClient()

  try {
    await assertPermission(orgId, user.id, 'org.roles.manage')
  } catch (e) {
    return catchPermission(e)
  }

  const slug = toSlug(name)
  if (!slug) return { error: 'Role name is invalid.' }
  if (BUILTIN_SLUGS.has(slug)) return { error: `"${name}" conflicts with a built-in role name.` }

  const { data, error } = await admin
    .from('roles')
    .insert({ org_id: orgId, name: name.trim(), slug, is_builtin: false })
    .select('id, name, slug')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'A role with that name already exists in this organization.' }
    return { error: error.message }
  }

  revalidatePath('/orgs/[slug]/settings/roles')
  return { role: data }
}

// ── updateRolePermissions ─────────────────────────────────────────────────────

export async function updateRolePermissions(
  roleId: string,
  permissionKeys: string[],
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: role } = await admin
    .from('roles')
    .select('org_id, slug')
    .eq('id', roleId)
    .maybeSingle()

  if (!role) return { error: 'Role not found.' }

  // G5: must hold org.roles.manage
  try {
    await assertPermission(role.org_id, user.id, 'org.roles.manage')
  } catch (e) {
    return catchPermission(e)
  }

  // G2: owner role permissions are frozen
  if (role.slug === 'owner') return { error: 'The owner role permissions cannot be modified.' }

  // G1: actor must hold every permission they are granting
  if (permissionKeys.length > 0) {
    const actorPerms = await getOrgPermissions(role.org_id, user.id)
    const forbidden = permissionKeys.filter(k => !permits(actorPerms, k))
    if (forbidden.length > 0) {
      return { error: `You can't grant a permission you don't have: ${forbidden[0]}` }
    }
  }

  const { data: current } = await admin
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', roleId)

  const currentSet = new Set((current ?? []).map(r => r.permission_key))
  const desiredSet = new Set(permissionKeys)

  const toDelete = [...currentSet].filter(k => !desiredSet.has(k))
  const toInsert = [...desiredSet].filter(k => !currentSet.has(k))

  if (toDelete.length > 0) {
    const { error } = await admin
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .in('permission_key', toDelete)
    if (error) return { error: error.message }
  }

  if (toInsert.length > 0) {
    const { error } = await admin
      .from('role_permissions')
      .insert(toInsert.map(k => ({ role_id: roleId, permission_key: k })))
    if (error) return { error: error.message }
  }

  revalidatePath('/orgs/[slug]/settings/roles')
  return { success: true }
}

// ── renameRole ────────────────────────────────────────────────────────────────

export async function renameRole(
  roleId: string,
  name: string,
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: role } = await admin
    .from('roles')
    .select('org_id, slug')
    .eq('id', roleId)
    .maybeSingle()

  if (!role) return { error: 'Role not found.' }

  try {
    await assertPermission(role.org_id, user.id, 'org.roles.manage')
  } catch (e) {
    return catchPermission(e)
  }

  // G2: owner role cannot be renamed
  if (role.slug === 'owner') return { error: 'The owner role cannot be renamed.' }

  const trimmed = name.trim()
  if (!trimmed) return { error: 'Role name cannot be empty.' }

  const { error } = await admin.from('roles').update({ name: trimmed }).eq('id', roleId)
  if (error) return { error: error.message }

  revalidatePath('/orgs/[slug]/settings/roles')
  return { success: true }
}

// ── deleteRole ────────────────────────────────────────────────────────────────

export async function deleteRole(roleId: string): Promise<{ success: true } | { error: string }> {
  const user = await requireUser()
  const admin = createAdminClient()

  const { data: role } = await admin
    .from('roles')
    .select('org_id, is_builtin, name')
    .eq('id', roleId)
    .maybeSingle()

  if (!role) return { error: 'Role not found.' }

  try {
    await assertPermission(role.org_id, user.id, 'org.roles.manage')
  } catch (e) {
    return catchPermission(e)
  }

  // G2: built-in roles cannot be deleted
  if (role.is_builtin) return { error: `Built-in role "${role.name}" cannot be deleted.` }

  // G3: role must have no members
  const { count } = await admin
    .from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', roleId)

  if ((count ?? 0) > 0) {
    return {
      error: `Reassign all ${count} member${count === 1 ? '' : 's'} before deleting this role.`,
    }
  }

  const { error } = await admin.from('roles').delete().eq('id', roleId)
  if (error) return { error: error.message }

  revalidatePath('/orgs/[slug]/settings/roles')
  return { success: true }
}

// ── assignMemberRole ──────────────────────────────────────────────────────────

export async function assignMemberRole(
  orgId: string,
  targetUserId: string,
  newRoleId: string,
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser()
  const admin = createAdminClient()

  try {
    await assertPermission(orgId, user.id, 'org.members.invite')
  } catch (e) {
    return catchPermission(e)
  }

  // Fetch target member's current role slug via role_id join (Option B: authoritative store)
  const { data: member } = await admin
    .from('org_members')
    .select('role_id, roles(slug)')
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)
    .maybeSingle()

  if (!member) return { error: 'Member not found in this organization.' }

  const rolesData = member.roles as unknown as { slug: string } | { slug: string }[] | null
  const currentSlug = Array.isArray(rolesData) ? rolesData[0]?.slug : rolesData?.slug

  // G4: prevent removing the last owner
  if (currentSlug === 'owner') {
    const { count } = await admin
      .from('org_members')
      .select('*, roles!inner(slug)', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('roles.slug', 'owner')

    if ((count ?? 0) <= 1) {
      return {
        error:
          'An organization must have at least one owner. Transfer ownership before changing this role.',
      }
    }
  }

  // Fetch new role — confirm it belongs to this org
  const { data: newRole } = await admin
    .from('roles')
    .select('slug, org_id')
    .eq('id', newRoleId)
    .maybeSingle()

  if (!newRole || newRole.org_id !== orgId) return { error: 'Role not found in this organization.' }

  // G1-equivalent: actor must hold every permission granted by the new role.
  // Prevents assigning owner (has org.billing/org.delete) or any custom role
  // whose permission set exceeds the actor's — closing privilege escalation via role assignment.
  const { data: newRolePerms } = await admin
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', newRoleId)

  if (newRolePerms && newRolePerms.length > 0) {
    const actorPerms = await getOrgPermissions(orgId, user.id)
    const forbidden = newRolePerms.map(p => p.permission_key).filter(k => !permits(actorPerms, k))
    if (forbidden.length > 0) {
      return {
        error: `You can't assign a role that grants permissions you don't have: ${forbidden[0]}`,
      }
    }
  }

  // Dual-write: role_id always; role enum only for built-in slug values
  const updatePayload: Record<string, unknown> = { role_id: newRoleId }
  if (ENUM_ROLES.includes(newRole.slug as OrgRole)) {
    updatePayload.role = newRole.slug as OrgRole
  }

  const { error } = await admin
    .from('org_members')
    .update(updatePayload)
    .eq('org_id', orgId)
    .eq('user_id', targetUserId)

  if (error) return { error: error.message }

  revalidatePath('/orgs/[slug]/settings/members')
  return { success: true }
}
