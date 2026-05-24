import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'wildapricot'

// WildApricot uses Basic Auth (clientId:secret) for token exchange, not body params
const TOKEN_ENDPOINT = 'https://oauth.wildapricot.org/auth/token'
const AUTH_ENDPOINT = 'https://oauth.wildapricot.org/auth/authorize'

class WildApricotAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'WildApricot'

  isConfigured(): boolean {
    return !!(process.env.WILDAPRICOT_CLIENT_ID && process.env.WILDAPRICOT_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('WildApricot not configured')
    const params = new URLSearchParams({
      client_id: process.env.WILDAPRICOT_CLIENT_ID!,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'auto offline_access',
      state,
    })
    return `${AUTH_ENDPOINT}?${params}`
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const credentials = Buffer.from(`${process.env.WILDAPRICOT_CLIENT_ID!}:${process.env.WILDAPRICOT_CLIENT_SECRET!}`).toString('base64')
      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      })
      if (!res.ok) throw new Error(await res.text())
      const tokens = await res.json()
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null

      // Fetch accountId to store for API calls
      let accountId: string | null = null
      try {
        const meRes = await fetch('https://api.wildapricot.org/v2.2/accounts/me', {
          headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          accountId = String(me.Id ?? me.id ?? '')
        }
      } catch { /* non-fatal */ }

      await supabase.from('org_integrations').upsert({
        org_id: orgId, provider: PROVIDER, status: 'connected',
        encrypted_refresh_token: encryptedToken,
        directionality_preferences: { accountId },
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

  private async getAccessToken(orgId: string): Promise<{ token: string; accountId: string } | null> {
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token, directionality_preferences').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return null
    try {
      const decrypted = decryptToken(data.encrypted_refresh_token)
      if (!decrypted) return null
      const credentials = Buffer.from(`${process.env.WILDAPRICOT_CLIENT_ID!}:${process.env.WILDAPRICOT_CLIENT_SECRET!}`).toString('base64')
      const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${credentials}` },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decrypted }),
      })
      if (!res.ok) throw new Error(await res.text())
      const tokens = await res.json()
      const accountId = (data.directionality_preferences as any)?.accountId ?? ''
      return { token: tokens.access_token, accountId }
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async verifyMembership(orgId: string, email: string): Promise<boolean> {
    const creds = await this.getAccessToken(orgId)
    if (!creds || !creds.accountId) return false
    try {
      const res = await fetch(
        `https://api.wildapricot.org/v2.2/accounts/${creds.accountId}/contacts?$filter=Email+eq+'${encodeURIComponent(email)}'&$select=MembershipEnabled,Status`,
        { headers: { Authorization: `Bearer ${creds.token}`, Accept: 'application/json' } }
      )
      if (!res.ok) return false
      const data: Record<string, unknown> = await res.json()
      const contacts = (data.Contacts as any[]) ?? []
      return contacts.some((c: any) => c.Status === 'Active member' && c.MembershipEnabled === true)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', err, { email }); return false }
  }
}

export const wildApricotAdapter = new WildApricotAdapter()
export default wildApricotAdapter
