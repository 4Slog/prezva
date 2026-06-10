import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Returns the user_id to use as `created_by` for embed-created rows.
 * Prefers the org owner; falls back to the earliest member.
 * Throws if the org has no members (should not happen for a bound org).
 */
export async function resolveOrgOwnerProfileId(
  db: SupabaseClient,
  orgId: string,
): Promise<string> {
  const { data, error } = await db
    .from('org_members')
    .select('user_id, role, joined_at')
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true })

  if (error) throw new Error(`Failed to resolve org owner: ${error.message}`)
  if (!data || data.length === 0) throw new Error(`Org ${orgId} has no members`)

  const owner = data.find(m => m.role === 'owner')
  return (owner ?? data[0]).user_id
}
