import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'teams'
const SCOPES = ['OnlineMeetings.ReadWrite', 'offline_access', 'User.Read']

class TeamsAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Microsoft Teams'

  isConfigured(): boolean {
    return !!((process.env.TEAMS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID) && (process.env.TEAMS_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET))
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Teams not configured')
    return getAuthUrl(PROVIDER, (process.env.TEAMS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(
        PROVIDER, code, redirectUri,
        (process.env.TEAMS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!,
        (process.env.TEAMS_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET)!,
      )
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({
        org_id: orgId,
        provider: PROVIDER,
        status: 'connected',
        encrypted_refresh_token: encryptedToken,
        scopes: tokens.scope?.split(' ') ?? SCOPES,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'handleCallback', err)
      throw err
    }
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
      const refreshToken = decryptToken(data.encrypted_refresh_token)
      return refreshAccessToken(PROVIDER, refreshToken, (process.env.TEAMS_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, (process.env.TEAMS_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET)!)
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err)
      return null
    }
  }

  async createMeeting(orgId: string, session: {
    id: string; title: string; starts_at: string; ends_at: string
  }): Promise<string | null> {
    const token = await this.getAccessToken(orgId)
    if (!token) return null

    const body = {
      startDateTime: session.starts_at,
      endDateTime: session.ends_at,
      subject: session.title,
    }

    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/onlineMeetings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return data.joinWebUrl ?? null
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'createMeeting', err, { sessionId: session.id })
      return null
    }
  }
}

export const teamsAdapter = new TeamsAdapter()
export default teamsAdapter
