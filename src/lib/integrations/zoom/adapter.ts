import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'zoom'
const SCOPES = ['meeting:write', 'webinar:write', 'user:read']

class ZoomAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Zoom'

  isConfigured(): boolean {
    return !!(process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Zoom not configured')
    return getAuthUrl(PROVIDER, process.env.ZOOM_CLIENT_ID!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(
        PROVIDER, code, redirectUri,
        process.env.ZOOM_CLIENT_ID!,
        process.env.ZOOM_CLIENT_SECRET!,
      )
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      await supabase.from('org_integrations').upsert({
        org_id: orgId,
        provider: PROVIDER,
        status: 'connected',
        encrypted_refresh_token: encryptedToken,
        scopes: SCOPES,
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
      if (!refreshToken) return null
      return refreshAccessToken(PROVIDER, refreshToken, process.env.ZOOM_CLIENT_ID!, process.env.ZOOM_CLIENT_SECRET!)
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err)
      return null
    }
  }

  async createMeeting(orgId: string, session: {
    id: string; title: string; starts_at: string; ends_at: string; description?: string | null
  }): Promise<string | null> {
    const token = await this.getAccessToken(orgId)
    if (!token) return null

    const durationMs = new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()
    const durationMin = Math.round(durationMs / 60000)

    const body = {
      topic: session.title,
      type: 2,
      start_time: session.starts_at,
      duration: durationMin,
      agenda: session.description ?? '',
      settings: { host_video: true, participant_video: true, join_before_host: true },
    }

    try {
      const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return data.join_url ?? null
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'createMeeting', err, { sessionId: session.id })
      return null
    }
  }
}

export const zoomAdapter = new ZoomAdapter()
export default zoomAdapter
