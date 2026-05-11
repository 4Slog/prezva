import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'google_drive'
const SCOPES = ['https://www.googleapis.com/auth/drive.file', 'offline_access']

class GoogleDriveAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Google Drive'

  isConfigured(): boolean {
    return !!(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Google Drive not configured')
    const url = getAuthUrl(PROVIDER, process.env.GOOGLE_DRIVE_CLIENT_ID!, redirectUri, SCOPES, state)
    return url + '&access_type=offline&prompt=consent'
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.GOOGLE_DRIVE_CLIENT_ID!, process.env.GOOGLE_DRIVE_CLIENT_SECRET!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({ org_id: orgId, provider: PROVIDER, status: 'connected', encrypted_refresh_token: encryptedToken, scopes: SCOPES, last_synced_at: new Date().toISOString() }, { onConflict: 'org_id,provider' })
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
      return refreshAccessToken(PROVIDER, decryptToken(data.encrypted_refresh_token), process.env.GOOGLE_DRIVE_CLIENT_ID!, process.env.GOOGLE_DRIVE_CLIENT_SECRET!)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async listFiles(orgId: string, query?: string): Promise<{ id: string; name: string; mimeType: string; webViewLink: string }[]> {
    const token = await this.getAccessToken(orgId)
    if (!token) return []
    const q = query ? encodeURIComponent(query) : 'mimeType+contains+%22application%22'
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink)&pageSize=50`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return data.files ?? []
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'listFiles', err); return [] }
  }
}

export const googleDriveAdapter = new GoogleDriveAdapter()
export default googleDriveAdapter
