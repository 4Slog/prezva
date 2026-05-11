import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'novi'

// Novi uses org-specific subdomain from NOVI_SUBDOMAIN env var
function getBaseUrl(): string {
  const subdomain = process.env.NOVI_SUBDOMAIN ?? ''
  return subdomain ? `https://${subdomain}.noviams.com` : 'https://noviams.com'
}

class NoviAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Novi AMS'

  isConfigured(): boolean {
    return !!(process.env.NOVI_CLIENT_ID && process.env.NOVI_CLIENT_SECRET && process.env.NOVI_SUBDOMAIN)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Novi AMS not configured')
    const baseUrl = getBaseUrl()
    const params = new URLSearchParams({
      client_id: process.env.NOVI_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'profile offline_access',
      state,
    })
    return `${baseUrl}/oauth/authorize?${params}`
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    const baseUrl = getBaseUrl()
    try {
      const res = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: process.env.NOVI_CLIENT_ID!,
          client_secret: process.env.NOVI_CLIENT_SECRET!,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const tokens = await res.json()
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({
        org_id: orgId, provider: PROVIDER, status: 'connected',
        encrypted_refresh_token: encryptedToken,
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

  private async getAccessToken(orgId: string): Promise<string | null> {
    const baseUrl = getBaseUrl()
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return null
    try {
      const res = await fetch(`${baseUrl}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: decryptToken(data.encrypted_refresh_token),
          client_id: process.env.NOVI_CLIENT_ID!,
          client_secret: process.env.NOVI_CLIENT_SECRET!,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const tokens = await res.json()
      return tokens.access_token
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async verifyMembership(orgId: string, email: string): Promise<boolean> {
    const token = await this.getAccessToken(orgId)
    if (!token) return false
    const baseUrl = getBaseUrl()
    try {
      const res = await fetch(`${baseUrl}/api/v1/members?email=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!res.ok) return false
      const result: Record<string, unknown> = await res.json()
      const members = (result.data as any[]) ?? (result.members as any[]) ?? []
      return members.length > 0
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', err, { email }); return false }
  }
}

export const noviAdapter = new NoviAdapter()
export default noviAdapter
