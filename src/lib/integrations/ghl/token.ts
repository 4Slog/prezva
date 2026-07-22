// GE-8: every runtime call site now resolves a per-org token via
// ghlAdapter.getAccessToken(orgId) (src/lib/integrations/ghl/adapter.ts) instead
// of this single-location PIT. getGhlToken survives for exactly one remaining
// caller — src/app/api/ghl/webhooks/refund/route.ts — whose GHL transaction
// lookup is keyed off GHL_LOCATION_ID and isn't per-tenant yet (Company-token
// batch). Do not delete this as dead code until that caller is migrated too.
export function getGhlToken(): string {
  const token = process.env.GHL_API_TOKEN
  if (!token) throw new Error('GHL_API_TOKEN is not set')
  return token
}
