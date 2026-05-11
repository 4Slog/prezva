import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'memberclicks'
const SCOPES = ['read:profile', 'read:membership', 'offline_access']

class MemberClicksAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'MemberClicks'

  isConfigured(): boolean {
    return !!(process.env.MEMBERCLICKS_CLIENT_ID && process.env.MEMBERCLICKS_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('MemberClicks not configured')
    return getAuthUrl(PROVIDER, process.env.MEMBERCLICKS_CLIENT_ID!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.MEMBERCLICKS_CLIENT_ID!, process.env.MEMBERCLICKS_CLIENT_SECRET!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null

      // Capture org slug from /api/v1/auth/me for API base URL
      let orgSlug: string | null = null
      try {
        const meRes = await fetch('https://api.memberclicks.net/api/v1/auth/me', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        if (meRes.ok) {
          const me = await meRes.json()
          orgSlug = me.org_slug ?? me.orgSlug ?? null
        }
      } catch { /* non-fatal */ }

      await supabase.from('org_integrations').upsert({
        org_id: orgId, provider: PROVIDER, status: 'connected',
        encrypted_refresh_token: encryptedToken,
        directionality_preferences: { orgSlug },
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
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return false
    try {
      const token = await refreshAccessToken(PROVIDER, decryptToken(data.encrypted_refresh_token), process.env.MEMBERCLICKS_CLIENT_ID!, process.env.MEMBERCLICKS_CLIENT_SECRET!)
      const res = await fetch(`https://api.memberclicks.net/api/v1/members?filter[email]=${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (!res.ok) return false
      const result: Record<string, unknown> = await res.json()
      const members = (result.data as any[]) ?? []
      return members.length > 0
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'verifyMembership', err, { email }); return false }
  }
}

export const memberClicksAdapter = new MemberClicksAdapter()
export default memberClicksAdapter
