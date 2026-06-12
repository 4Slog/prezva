import type { SupabaseClient } from '@supabase/supabase-js'

export async function ghlLocationIdForOrg(
  admin: SupabaseClient,
  orgId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('ghl_location_links')
    .select('ghl_location_id')
    .eq('org_id', orgId)
    .limit(1)
    .single()
  return data?.ghl_location_id ?? null
}
