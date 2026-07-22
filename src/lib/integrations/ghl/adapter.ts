import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { createAdminClient } from '@/lib/supabase/admin'
import { provisionGhlOrgConfig } from './provisioner'

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
  'pipelines.write',
  'pipelines.create',
  'conversations.write',
  'products.readonly',
  'products/prices.readonly',
  'users.readonly',
  'workflows.readonly',
]

export const REDIRECT_URI = 'https://prezva.app/api/oauth/callback'
export const STATE_COOKIE = 'ghl_oauth_state'

export type PendingInstallResult =
  | { stored: true }
  | { stored: false; reason: 'no_location' | 'encryption_unavailable' | 'exchange_failed' }

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

  private async exchangeCode(code: string, redirectUri: string): Promise<GhlTokenResponse> {
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
    return tokens
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const tokens = await this.exchangeCode(code, redirectUri)

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

      try {
        await provisionGhlOrgConfig(admin, tokens.access_token, orgId, tokens.locationId)
      } catch (e) {
        console.error('[ghl-provision] failed for org', orgId, e instanceof Error ? e.message : String(e))
      }
    } else if (tokens.userType === 'Company') {
      console.log('[ghl-oauth] Company/agency token stored; per-location enumeration deferred to Batch 3')
    }
  }

  // Marketplace-originated cold install (GE-8 entitlement batch): GHL sent
  // the code straight to REDIRECT_URI with no /api/oauth/start state cookie,
  // because no Prezva session/org exists yet. Exchange the code and park the
  // tokens by location — claimPendingInstall binds them to an org later, at
  // claim time. No org is touched here.
  async handlePendingInstall(code: string, redirectUri: string): Promise<PendingInstallResult> {
    let tokens: GhlTokenResponse
    try {
      tokens = await this.exchangeCode(code, redirectUri)
    } catch (err) {
      console.error('[ghl-oauth] pending install: token exchange failed:', err instanceof Error ? err.message : String(err))
      return { stored: false, reason: 'exchange_failed' }
    }

    if (!(tokens.userType === 'Location' && tokens.locationId)) {
      // Company/agency-level cold installs have no location to key a
      // pending row on. Nothing to park.
      console.log('[ghl-oauth] pending install: no location in token response — nothing stored')
      return { stored: false, reason: 'no_location' }
    }

    const encryptedAccess = encryptToken(tokens.access_token)
    const encryptedRefresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
    if (!encryptedAccess || !encryptedRefresh) {
      console.error('[ghl-oauth] pending install: encryption unavailable — refusing to half-store tokens')
      return { stored: false, reason: 'encryption_unavailable' }
    }

    const admin = createAdminClient()
    const expiresInSeconds = tokens.expires_in ?? 86400

    await admin.from('ghl_pending_installs').upsert({
      ghl_location_id: tokens.locationId,
      ghl_company_id: tokens.companyId ?? null,
      encrypted_access_token: encryptedAccess,
      encrypted_refresh_token: encryptedRefresh,
      token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
      scopes: SCOPES,
    }, { onConflict: 'ghl_location_id' })

    return { stored: true }
  }

  // Consumes a pending install for `locationId` and binds it to `orgId`:
  // upserts org_integrations + ghl_location_links (mirrors handleCallback's
  // own writes) and deletes the pending row. Returns the decrypted access
  // token so the caller can run provisionGhlOrgConfig; null if no pending
  // install exists for this location.
  async claimPendingInstall(locationId: string, orgId: string): Promise<{ accessToken: string } | null> {
    const admin = createAdminClient()

    // Atomic DELETE...RETURNING: the delete itself is the lock. Only the
    // first of any concurrent callers for this location_id gets a non-null
    // row back — a second caller's delete affects zero rows. This closes the
    // read-then-delete race where two claimants could each read the
    // still-present row before either delete ran, each binding a copy of the
    // same live tokens into a different org (security review, Vuln 4 on
    // 6e465e9). The caller (claimLocation) is responsible for distinguishing
    // "someone else just won this race" from "no install exists at all" when
    // this returns null.
    const { data: pending } = await admin
      .from('ghl_pending_installs')
      .delete()
      .eq('ghl_location_id', locationId)
      .select('encrypted_access_token, encrypted_refresh_token, token_expires_at, scopes, ghl_company_id')
      .maybeSingle()

    if (!pending) return null

    const accessToken = decryptToken(pending.encrypted_access_token)
    if (!accessToken) throw new Error('claimPendingInstall: failed to decrypt pending access token')

    await admin.from('org_integrations').upsert({
      org_id: orgId,
      provider: PROVIDER,
      status: 'connected',
      encrypted_access_token: pending.encrypted_access_token,
      encrypted_refresh_token: pending.encrypted_refresh_token,
      token_expires_at: pending.token_expires_at,
      scopes: pending.scopes ?? SCOPES,
    }, { onConflict: 'org_id,provider' })

    await admin.from('ghl_location_links').upsert({
      ghl_location_id: locationId,
      org_id: orgId,
      ghl_account_id: pending.ghl_company_id ?? null,
    }, { onConflict: 'ghl_location_id' })

    return { accessToken }
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
      status: 'connected',
      encrypted_access_token: encryptToken(tokens.access_token),
      encrypted_refresh_token: encryptedRefreshToken,
      token_expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    }).eq('org_id', orgId).eq('provider', PROVIDER)

    return tokens.access_token
  }
}

export const ghlAdapter = new GhlAdapter()
export default ghlAdapter
