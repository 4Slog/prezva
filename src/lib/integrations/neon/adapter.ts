import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDER = 'neon'
const SCOPES = ['basic', 'offline']

class NeonAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Neon CRM'

  isConfigured(): boolean {
    return !!(process.env.NEON_CLIENT_ID && process.env.NEON_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Neon CRM not configured')
    return getAuthUrl(PROVIDER, process.env.NEON_CLIENT_ID!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = createAdminClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.NEON_CLIENT_ID!, process.env.NEON_CLIENT_SECRET!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      const { error: saveError } = await supabase.from('org_integrations').upsert({
        org_id: orgId, provider: PROVIDER, status: 'connected',
        encrypted_refresh_token: encryptedToken,
        scopes: SCOPES,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
      if (saveError) throw new Error(`${this.displayName} connect failed: ${saveError.message}`)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'handleCallback', err); throw err }
  }

  async disconnect(orgId: string): Promise<void> {
    const supabase = createAdminClient()
    const { error } = await supabase.from('org_integrations').update({ status: 'available', encrypted_refresh_token: null }).eq('org_id', orgId).eq('provider', PROVIDER)
    if (error) throw new Error(`${this.displayName} disconnect failed: ${error.message}`)
  }

  async getStatus(orgId: string): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return 'awaiting_credentials'
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('org_integrations').select('status').eq('org_id', orgId).eq('provider', PROVIDER).maybeSingle()
    if (error) throw new Error(`${this.displayName} status read failed: ${error.message}`)
    return (data?.status as IntegrationStatus) ?? 'available'
  }

  async verifyMembership(orgId: string, email: string): Promise<boolean> {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).maybeSingle()
    if (error) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', error.message, { email }); return false }
    if (!data?.encrypted_refresh_token) return false
    try {
      const decrypted = decryptToken(data.encrypted_refresh_token)
      if (!decrypted) return false
      const token = await refreshAccessToken(PROVIDER, decrypted, process.env.NEON_CLIENT_ID!, process.env.NEON_CLIENT_SECRET!)
      // Neon uses userSessionId (access_token) as query param
      const res = await fetch(
        `https://api.neoncrm.com/neonws/services/api/account/listAccounts?userSessionId=${encodeURIComponent(token)}&Email=${encodeURIComponent(email)}`,
        { headers: { Accept: 'application/json' } }
      )
      if (!res.ok) return false
      const result: Record<string, unknown> = await res.json()
      const accounts = (result.searchResults as any)?.nameResults ?? []
      return Array.isArray(accounts) && accounts.length > 0
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', err, { email }); return false }
  }
}

export const neonAdapter = new NeonAdapter()
export default neonAdapter
