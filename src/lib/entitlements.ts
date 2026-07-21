import { createAdminClient } from '@/lib/supabase/admin'

export interface EntitlementRequiredError {
  error: 'entitlement_required'
}

// Rule (GE-8 R36-R41): one flag, no tiers/pricing machinery. An org is
// entitled once it's off the 'free' plan and, if entitled_until is set,
// that date hasn't passed yet. entitled_until IS NULL means "no expiry".
export async function isOrgEntitled(orgId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('organizations')
    .select('plan, entitled_until')
    .eq('id', orgId)
    .maybeSingle()

  if (!data || data.plan === 'free') return false
  if (data.entitled_until && new Date(data.entitled_until) <= new Date()) return false
  return true
}

// Gate for embed-lane server actions. Returns null when the org may proceed,
// or a typed error shape the caller returns as-is — callers/UI decide the
// copy (e.g. "Publishing requires an active Prezva plan"), this stays a
// stable machine-readable code with no pricing/tier language baked in.
export async function requireEntitlement(orgId: string): Promise<EntitlementRequiredError | null> {
  const entitled = await isOrgEntitled(orgId)
  return entitled ? null : { error: 'entitlement_required' }
}
