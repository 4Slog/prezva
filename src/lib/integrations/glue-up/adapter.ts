import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDER = 'glue_up'
const SCOPES = ['profile', 'membership', 'offline_access']

class GlueUpAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Glue Up'

  isConfigured(): boolean {
    return !!(process.env.GLUEUP_CLIENT_ID && process.env.GLUEUP_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Glue Up not configured')
    return getAuthUrl(PROVIDER, process.env.GLUEUP_CLIENT_ID!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = createAdminClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.GLUEUP_CLIENT_ID!, process.env.GLUEUP_CLIENT_SECRET!)
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
      const token = await refreshAccessToken(PROVIDER, decrypted, process.env.GLUEUP_CLIENT_ID!, process.env.GLUEUP_CLIENT_SECRET!)
      const res = await fetch(`https://app.glueup.com/api/v1/crm/contacts/?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!res.ok) return false
      const result: Record<string, unknown> = await res.json()
      const contacts = (result.results as any[]) ?? (result.data as any[]) ?? []
      return contacts.some((c: any) => c.is_member === true || c.membership_status === 'active')
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', err, { email }); return false }
  }
}

export const glueUpAdapter = new GlueUpAdapter()
export default glueUpAdapter
