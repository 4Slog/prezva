import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDER = 'ghl'
const GHL_BASE_URL = 'https://services.leadconnectorhq.com'
const GHL_AUTH_URL = 'https://marketplace.gohighlevel.com/v2/oauth/chooselocation'
const REFRESH_SKEW_MS = 2 * 60 * 1000

const SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'locations/customFields.readonly',
  'locations/customFields.write',
  'locations.readonly',
  'locations/customValues.readonly',
  'locations/customValues.write',
  'oauth.write',
  'oauth.readonly',
  'opportunities.readonly',
  'opportunities.write',
  'payments/orders.readonly',
  'payments/transactions.readonly',
  'pipelines.readonly',
  'products.readonly',
  'products/prices.readonly',
  'users.readonly',
  'workflows.readonly',
]

export const REDIRECT_URI = 'https://prezva.app/api/oauth/callback'

interface GhlTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  userType?: string
  locationId?: string
  companyId?: string
  scope?: string
}

class GhlAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'GoHighLevel'

  isConfigured(): boolean {
    return Boolean(process.env.GHL_CLIENT_ID && process.env.GHL_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.GHL_CLIENT_ID!,
      redirect_uri: redirectUri,
      scope: SCOPES.join(' '),
      state,
    })
    return `${GHL_AUTH_URL}?${params}`
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const res = await fetch(`${GHL_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID!,
        client_secret: process.env.GHL_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })
    const tokens: GhlTokenResponse = await res.json()
    if (!res.ok) throw new Error(`GHL token exchange failed: ${res.status}`)

    const admin = createAdminClient()
    const expiresInSeconds = tokens.expires_in ?? 86400

    await admin.from('org_integrations').upsert({
      org_id: orgId,
      provider: PROVIDER,
      status: 'connected',
      encrypted_access_token: encryptToken(tokens.access_token),
      encrypted_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
      token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      scopes: SCOPES,
    }, { onConflict: 'org_id,provider' })

    if (tokens.userType === 'Location' && tokens.locationId) {
      await admin.from('ghl_location_links').upsert({
        ghl_location_id: tokens.locationId,
        org_id: orgId,
        ghl_account_id: tokens.companyId ?? null,
      }, { onConflict: 'ghl_location_id' })
    } else if (tokens.userType === 'Company') {
      console.log('[ghl-oauth] Company/agency token stored; per-location enumeration deferred to Batch 3')
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
    return (data?.status as IntegrationStatus) ?? 'available'
  }

  async getAccessToken(orgId: string): Promise<string | null> {
    const admin = createAdminClient()
    const { data } = await admin
      .from('org_integrations')
      .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .eq('org_id', orgId)
      .eq('provider', PROVIDER)
      .maybeSingle()

    if (!data?.encrypted_access_token) return null

    const expiresAt = data.token_expires_at ? new Date(data.token_expires_at).getTime() : 0
    if (expiresAt > Date.now() + REFRESH_SKEW_MS) {
      return decryptToken(data.encrypted_access_token)
    }

    if (!data.encrypted_refresh_token) return null
    const refreshToken = decryptToken(data.encrypted_refresh_token)
    if (!refreshToken) return null

    const res = await fetch(`${GHL_BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GHL_CLIENT_ID!,
        client_secret: process.env.GHL_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    const tokens: GhlTokenResponse = await res.json()
    if (!res.ok) {
      await admin.from('org_integrations').update({ status: 'error' }).eq('org_id', orgId).eq('provider', PROVIDER)
      return null
    }

    const expiresInSeconds = tokens.expires_in ?? 86400
    const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : data.encrypted_refresh_token

    await admin.from('org_integrations').update({
      encrypted_access_token: encryptToken(tokens.access_token),
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    }).eq('org_id', orgId).eq('provider', PROVIDER)

    return tokens.access_token
  }
}

export const ghlAdapter = new GhlAdapter()
export default ghlAdapter
