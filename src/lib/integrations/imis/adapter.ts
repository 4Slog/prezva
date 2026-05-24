import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'imis'
const SCOPES = ['openid', 'offline_access']

class IMISAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'iMIS'

  isConfigured(): boolean {
    return !!(process.env.IMIS_CLIENT_ID && process.env.IMIS_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('iMIS not configured')
    return getAuthUrl(PROVIDER, process.env.IMIS_CLIENT_ID!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.IMIS_CLIENT_ID!, process.env.IMIS_CLIENT_SECRET!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({
        org_id: orgId, provider: PROVIDER, status: 'connected',
        encrypted_refresh_token: encryptedToken,
        scopes: SCOPES,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'handleCallback', err); throw err }
  }

  async disconnect(orgId: string): Promise<void> {
    const supabase = await createClient()
    await supabase.from('org_integrations').update({ status: 'available', encrypted_refresh_token: null }).eq('org_id', orgId).eq('provider', PROVIDER)
  }

  async getStatus(orgId: string): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return 'awaiting_credentials'
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('status').eq('org_id', orgId).eq('provider', PROVIDER).maybeSingle()
    return (data?.status as IntegrationStatus) ?? 'available'
  }

  async verifyMembership(orgId: string, email: string): Promise<boolean> {
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token, directionality_preferences').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return false
    const baseUrl: string = (data.directionality_preferences as any)?.baseUrl ?? 'https://api.imis.com'
    try {
      const decrypted = decryptToken(data.encrypted_refresh_token)
      if (!decrypted) return false
      const token = await refreshAccessToken(PROVIDER, decrypted, process.env.IMIS_CLIENT_ID!, process.env.IMIS_CLIENT_SECRET!)
      const res = await fetch(`${baseUrl}/api/Party?Email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!res.ok) return false
      const result: Record<string, unknown> = await res.json()
      const items = (result.Items as any[]) ?? (result.items as any[]) ?? []
      return items.length > 0
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', err, { email }); return false }
  }
}

export const imisAdapter = new IMISAdapter()
export default imisAdapter
