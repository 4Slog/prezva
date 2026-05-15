import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'sharepoint'
const SCOPES = ['Files.Read', 'offline_access', 'User.Read']

class SharePointAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'SharePoint / OneDrive'

  isConfigured(): boolean {
    return !!((process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID) && (process.env.SHAREPOINT_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET))
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('SharePoint not configured')
    return getAuthUrl(PROVIDER, (process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, (process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, (process.env.SHAREPOINT_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET)!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({ org_id: orgId, provider: PROVIDER, status: 'connected', encrypted_refresh_token: encryptedToken, scopes: tokens.scope?.split(' ') ?? SCOPES, last_synced_at: new Date().toISOString() }, { onConflict: 'org_id,provider' })
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

  async getAccessToken(orgId: string): Promise<string | null> {
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return null
    try {
      return refreshAccessToken(PROVIDER, decryptToken(data.encrypted_refresh_token), (process.env.SHAREPOINT_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, (process.env.SHAREPOINT_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET)!)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async listFiles(orgId: string): Promise<{ id: string; name: string; downloadUrl: string }[]> {
    const token = await this.getAccessToken(orgId)
    if (!token) return []
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,@microsoft.graph.downloadUrl', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return (data.value ?? []).map((f: any) => ({ id: f.id, name: f.name, downloadUrl: f['@microsoft.graph.downloadUrl'] ?? '' }))
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'listFiles', err); return [] }
  }
}

export const sharePointAdapter = new SharePointAdapter()
export default sharePointAdapter
