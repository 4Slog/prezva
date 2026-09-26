import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDER = 'outlook'
const SCOPES = ['Calendars.ReadWrite', 'offline_access', 'User.Read']

class OutlookAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Outlook Calendar'

  isConfigured(): boolean {
    return !!((process.env.OUTLOOK_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID) && (process.env.OUTLOOK_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET))
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Outlook not configured')
    return getAuthUrl(PROVIDER, (process.env.OUTLOOK_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = createAdminClient()
    try {
      const tokens = await exchangeCodeForTokens(
        PROVIDER, code, redirectUri,
        (process.env.OUTLOOK_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!,
        (process.env.OUTLOOK_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET)!,
      )
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      const { error: saveError } = await supabase.from('org_integrations').upsert({
        org_id: orgId,
        provider: PROVIDER,
        status: 'connected',
        encrypted_refresh_token: encryptedToken,
        scopes: tokens.scope?.split(' ') ?? SCOPES,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'org_id,provider' })
      if (saveError) throw new Error(`${this.displayName} connect failed: ${saveError.message}`)
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'handleCallback', err)
      throw err
    }
  }

  async disconnect(orgId: string): Promise<void> {
    const supabase = createAdminClient()
    const { error } = await supabase.from('org_integrations').update({ status: 'available', encrypted_refresh_token: null }).eq('org_id', orgId).eq('provider', PROVIDER)
    if (error) throw new Error(`${this.displayName} disconnect failed: ${error.message}`)
  }

  async getStatus(orgId: string): Promise<IntegrationStatus> {
    if (!this.isConfigured()) return 'awaiting_credentials'
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('org_integrations').select('status').eq('org_id', orgId).eq('provider', PROVIDER).maybeSingle()
    if (error) throw new Error(`${this.displayName} status read failed: ${error.message}`)
    return (data?.status as IntegrationStatus) ?? 'available'
  }

  async getAccessToken(orgId: string): Promise<string | null> {
    const supabase = createAdminClient()
    const { data, error } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).maybeSingle()
    if (error) throw new Error(`${this.displayName} token read failed: ${error.message}`)
    if (!data?.encrypted_refresh_token) return null
    try {
      const refreshToken = decryptToken(data.encrypted_refresh_token)
      if (!refreshToken) return null
      return refreshAccessToken(PROVIDER, refreshToken, (process.env.OUTLOOK_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID)!, (process.env.OUTLOOK_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET)!)
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err)
      return null
    }
  }

  async createCalendarEvent(orgId: string, session: {
    title: string; starts_at: string; ends_at: string; description?: string | null; location?: string | null
  }): Promise<void> {
    const token = await this.getAccessToken(orgId)
    if (!token) return

    const body = {
      subject: session.title,
      body: { contentType: 'text', content: session.description ?? '' },
      start: { dateTime: session.starts_at, timeZone: 'UTC' },
      end: { dateTime: session.ends_at, timeZone: 'UTC' },
      location: session.location ? { displayName: session.location } : undefined,
    }

    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err: any) {
      await logIntegrationError(orgId, PROVIDER, 'createCalendarEvent', err, { session })
    }
  }
}

export const outlookAdapter = new OutlookAdapter()
export default outlookAdapter
