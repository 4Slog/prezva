import { createClient } from '@/lib/supabase/server'
import { getAdapter } from './registry'

const ASSOCIATION_PROVIDERS = ['wildapricot', 'imis', 'memberclicks', 'yourmembership', 'glue_up', 'neon', 'novi']

export async function verifyMembership(orgId: string, email: string): Promise<{ verified: boolean; provider: string | null }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('org_integrations')
    .select('provider')
    .eq('org_id', orgId)
    .eq('status', 'connected')
    .in('provider', ASSOCIATION_PROVIDERS)
    .limit(1)
    .maybeSingle()
  if (!data) return { verified: false, provider: null }
  const adapter = getAdapter(data.provider)
  if (!adapter.verifyMembership) return { verified: false, provider: data.provider }
  const verified = await adapter.verifyMembership(orgId, email)
  return { verified, provider: data.provider }
}
