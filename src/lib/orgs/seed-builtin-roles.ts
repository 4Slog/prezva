import type { SupabaseClient } from '@supabase/supabase-js'

// Curated operational permission set for staff — intentionally fixed.
// Staff should NOT auto-inherit new permissions added to the catalog;
// those require a conscious decision by the org admin.
const STAFF_KEYS = [
  'agenda.manage',
  'agenda.view',
  'analytics.view',
  'announcements.manage',
  'attendees.edit',
  'attendees.manage',
  'attendees.view',
  'badges.manage',
  'checkin.manage',
  'community.manage',
  'icebreakers.manage',
  'leaderboard.view',
  'networking.view',
  'org.members.view',
  'org.speaker_library.view',
  'org.templates.view',
  'passport.manage',
  'photos.manage',
  'qa.moderate',
  'qa.view',
  'run_of_show.manage',
  'run_of_show.view',
  'speakers.view',
  'sponsors.view',
  'surveys.view',
  'trivia.manage',
  'video.view',
  'volunteers.manage',
] as const // 28 keys — must match permissions catalog exactly

const ADMIN_EXCLUDED = new Set(['org.billing', 'org.delete'])

/**
 * Seeds the 3 built-in roles (Owner/Admin/Staff) for a newly created org,
 * with their full permission sets drawn from the live catalog. Idempotent —
 * safe to re-run: roles upsert on UNIQUE(org_id,slug), role_permissions
 * upsert on PK(role_id,permission_key).
 *
 * Owner = all catalog keys (inherits future additions automatically).
 * Admin = all catalog keys except org.billing and org.delete.
 * Staff = STAFF_KEYS constant (curated; new permissions require explicit grant).
 *
 * Must be called with an admin/service-role client — roles_insert RLS only
 * allows is_builtin=false for non-service callers; built-in seeding requires
 * service role.
 *
 * Returns the owner role_id (for immediate use in the org_members insert).
 * Throws on any DB error — callers must handle and surface to the user.
 */
export async function seedBuiltinRoles(orgId: string, admin: SupabaseClient): Promise<string> {
  // Step 1: upsert 3 built-in roles.
  // ignoreDuplicates defaults to false → on conflict the row is updated and
  // returned, so bySlug is always populated even on a re-run.
  const { data: upserted, error: rolesErr } = await admin
    .from('roles')
    .upsert(
      [
        { org_id: orgId, name: 'Owner', slug: 'owner', is_builtin: true, description: 'Full access' },
        { org_id: orgId, name: 'Admin', slug: 'admin', is_builtin: true, description: 'Administrative access (no billing/delete)' },
        { org_id: orgId, name: 'Staff', slug: 'staff', is_builtin: true, description: 'Operational access' },
      ],
      { onConflict: 'org_id,slug', ignoreDuplicates: false },
    )
    .select('id, slug')

  if (rolesErr) throw new Error(`seedBuiltinRoles: roles upsert — ${rolesErr.message}`)

  // Guard: if upsert returned fewer than 3 rows (e.g. driver quirk on
  // no-op updates), fall back to a SELECT to resolve all 3 ids.
  let roles = upserted ?? []
  if (roles.length < 3) {
    const { data: fetched, error: fetchErr } = await admin
      .from('roles')
      .select('id, slug')
      .eq('org_id', orgId)
      .in('slug', ['owner', 'admin', 'staff'])
      .eq('is_builtin', true)
    if (fetchErr || !fetched || fetched.length < 3) {
      throw new Error(`seedBuiltinRoles: could not resolve role ids after upsert — ${fetchErr?.message ?? 'got ' + (fetched?.length ?? 0) + ' rows'}`)
    }
    roles = fetched
  }

  const bySlug = Object.fromEntries(roles.map(r => [r.slug as string, r.id as string]))
  if (!bySlug['owner'] || !bySlug['admin'] || !bySlug['staff']) {
    throw new Error(`seedBuiltinRoles: missing slug in resolved roles — got: ${Object.keys(bySlug).join(', ')}`)
  }

  // Step 2: fetch live permissions catalog — owner + admin inherit all keys
  // automatically when new permissions are added.
  const { data: allPerms, error: permsErr } = await admin.from('permissions').select('key')
  if (permsErr || !allPerms) {
    throw new Error(`seedBuiltinRoles: permissions fetch — ${permsErr?.message}`)
  }

  const allKeys = allPerms.map(p => p.key as string)
  const adminKeys = allKeys.filter(k => !ADMIN_EXCLUDED.has(k))

  // Step 3: upsert role_permissions (idempotent via PK).
  const rows = [
    ...allKeys.map(k => ({ role_id: bySlug['owner'], permission_key: k })),
    ...adminKeys.map(k => ({ role_id: bySlug['admin'], permission_key: k })),
    ...STAFF_KEYS.map(k => ({ role_id: bySlug['staff'], permission_key: k })),
  ]

  const { error: rpErr } = await admin
    .from('role_permissions')
    .upsert(rows, { onConflict: 'role_id,permission_key', ignoreDuplicates: true })

  if (rpErr) throw new Error(`seedBuiltinRoles: role_permissions upsert — ${rpErr.message}`)

  return bySlug['owner']
}
