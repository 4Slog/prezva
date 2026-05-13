import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDER = 'ghl'
const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_AUTH = 'https://marketplace.gohighlevel.com/oauth/chooselocation'
const GHL_SCOPES = 'contacts.readonly contacts.write locations.readonly opportunities.write'

class GhlAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'GoHighLevel'

  isConfigured(): boolean {
    return !!(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GHL_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: GHL_SCOPES,
      state,
    })
    return `${GHL_AUTH}?${params}`
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const res = await fetch(`${GHL_BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.GHL_CLIENT_ID!,
        client_secret: process.env.GHL_CLIENT_SECRET!,
        redirect_uri: redirectUri,
      }),
    })
    const tokens = await res.json()
    if (!res.ok) throw new Error(`GHL OAuth failed: ${tokens.message ?? res.status}`)

    const admin = createAdminClient()
    await admin.from('org_integrations').upsert({
      org_id: orgId,
      provider: PROVIDER,
      status: 'connected',
      encrypted_refresh_token: encryptToken(tokens.refresh_token ?? ''),
      encrypted_access_token: encryptToken(tokens.access_token),
      token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 86400) * 1000).toISOString(),
      scopes: tokens.scope ? [tokens.scope] : [GHL_SCOPES],
    }, { onConflict: 'org_id,provider' })

    if (tokens.locationId) {
      await admin.from('organizations').update({ ghl_location_id: tokens.locationId }).eq('id', orgId)
    }
    if (tokens.companyId) {
      await admin.from('organizations').update({ ghl_account_id: tokens.companyId }).eq('id', orgId)
    }
  }

  async disconnect(orgId: string): Promise<void> {
    const admin = createAdminClient()
    await admin.from('org_integrations').delete().eq('org_id', orgId).eq('provider', PROVIDER)
  }

  async getStatus(orgId: string): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return 'awaiting_credentials'
    const admin = createAdminClient()
    const { data } = await admin
      .from('org_integrations')
      .select('status')
      .eq('org_id', orgId)
      .eq('provider', PROVIDER)
      .maybeSingle()
    if (!data) return 'available'
    return data.status as IntegrationStatus
  }

  async getAccessToken(orgId: string): Promise<string> {
    const admin = createAdminClient()
    const { data } = await admin
      .from('org_integrations')
      .select('encrypted_access_token, token_expires_at, encrypted_refresh_token')
      .eq('org_id', orgId)
      .eq('provider', PROVIDER)
      .single()

    if (!data?.encrypted_access_token) throw new Error('GHL not connected')

    // Refresh if expiring within 5 minutes
    if (!data.token_expires_at || new Date(data.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
      const refreshToken = decryptToken(data.encrypted_refresh_token!)
      const res = await fetch(`${GHL_BASE}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.GHL_CLIENT_ID!,
          client_secret: process.env.GHL_CLIENT_SECRET!,
        }),
      })
      const tokens = await res.json()
      if (!res.ok) {
        await admin.from('org_integrations').update({ status: 'error' }).eq('org_id', orgId).eq('provider', PROVIDER)
        throw new Error('GHL token refresh failed')
      }
      await admin.from('org_integrations').update({
        encrypted_access_token: encryptToken(tokens.access_token),
        encrypted_refresh_token: encryptToken(tokens.refresh_token ?? refreshToken),
        token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 86400) * 1000).toISOString(),
      }).eq('org_id', orgId).eq('provider', PROVIDER)
      return tokens.access_token as string
    }

    return decryptToken(data.encrypted_access_token)
  }
}

export const ghlAdapter = new GhlAdapter()
