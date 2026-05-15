import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'mailchimp'

class MailchimpAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Mailchimp'

  isConfigured(): boolean {
    return !!(process.env.MAILCHIMP_CLIENT_ID && process.env.MAILCHIMP_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Mailchimp not configured')
    return getAuthUrl(PROVIDER, process.env.MAILCHIMP_CLIENT_ID!, redirectUri, [], state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.MAILCHIMP_CLIENT_ID!, process.env.MAILCHIMP_CLIENT_SECRET!)
      // Mailchimp returns access_token only (no refresh — long-lived)
      const encryptedToken = encryptToken(tokens.access_token)
      // Get server prefix (data center) from metadata endpoint
      let dc = 'us1'
      try {
        const meta = await fetch('https://login.mailchimp.com/oauth2/metadata', { headers: { Authorization: `OAuth ${tokens.access_token}` } })
        if (meta.ok) {
          const m = await meta.json()
          dc = m.dc ?? 'us1'
        }
      } catch { /* use default dc */ }
      await supabase.from('org_integrations').upsert({ org_id: orgId, provider: PROVIDER, status: 'connected', encrypted_refresh_token: encryptedToken, directionality_preferences: { dc }, last_synced_at: new Date().toISOString() }, { onConflict: 'org_id,provider' })
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

  private async getAccessTokenAndDc(orgId: string): Promise<{ token: string; dc: string } | null> {
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token, directionality_preferences').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return null
    const token = decryptToken(data.encrypted_refresh_token)
    const dc = (data.directionality_preferences as any)?.dc ?? 'us1'
    return { token, dc }
  }

  async syncAudience(orgId: string, listId: string, members: { email: string; firstName?: string; lastName?: string }[]): Promise<{ synced: number; errors: number }> {
    const creds = await this.getAccessTokenAndDc(orgId)
    if (!creds) return { synced: 0, errors: 0 }

    const batchSize = 500
    let synced = 0
    let errors = 0

    for (let i = 0; i < members.length; i += batchSize) {
      const batch = members.slice(i, i + batchSize).map(m => ({
        email_address: m.email,
        status_if_new: 'subscribed',
        merge_fields: { FNAME: m.firstName ?? '', LNAME: m.lastName ?? '' },
      }))
      try {
        const res = await fetch(`https://${creds.dc}.api.mailchimp.com/3.0/lists/${listId}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ members: batch, update_existing: true }),
        })
        if (res.ok) {
          const data = await res.json()
          synced += data.updated_members?.length ?? 0
          synced += data.new_members?.length ?? 0
          errors += data.errors?.length ?? 0
        } else {
          errors += batch.length
        }
      } catch (err: any) {
        await logIntegrationError(orgId, PROVIDER, 'syncAudience', err)
        errors += batch.length
      }
    }
    return { synced, errors }
  }

  async getLists(orgId: string): Promise<{ id: string; name: string; memberCount: number }[]> {
    const creds = await this.getAccessTokenAndDc(orgId)
    if (!creds) return []
    try {
      const res = await fetch(`https://${creds.dc}.api.mailchimp.com/3.0/lists?count=100&fields=lists.id,lists.name,lists.stats.member_count`, { headers: { Authorization: `Bearer ${creds.token}` } })
      if (!res.ok) return []
      const data = await res.json()
      return (data.lists ?? []).map((l: any) => ({ id: l.id, name: l.name, memberCount: l.stats?.member_count ?? 0 }))
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getLists', err); return [] }
  }
}

export const mailchimpAdapter = new MailchimpAdapter()
export default mailchimpAdapter
