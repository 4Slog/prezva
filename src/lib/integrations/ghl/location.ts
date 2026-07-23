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

export async function ghlOrgIdForLocation(
  admin: SupabaseClient,
  locationId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', locationId)
    .maybeSingle()
  return data?.org_id ?? null
}

export async function isEventGhlLinked(
  admin: SupabaseClient,
  eventId: string,
): Promise<{ linked: boolean; orgId: string | null; locationId: string | null }> {
  const { data: event } = await admin
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .maybeSingle()
  const orgId = event?.org_id ?? null
  const locationId = orgId ? await ghlLocationIdForOrg(admin, orgId) : null
  return { linked: !!locationId, orgId, locationId }
}
