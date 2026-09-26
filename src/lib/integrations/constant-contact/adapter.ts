import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens, refreshAccessToken } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDER = 'constant_contact'
const SCOPES = ['contact_data', 'offline_access']

class ConstantContactAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Constant Contact'

  isConfigured(): boolean {
    return !!(process.env.CONSTANT_CONTACT_CLIENT_ID && process.env.CONSTANT_CONTACT_CLIENT_SECRET)
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    if (!this.isConfigured()) throw new Error('Constant Contact not configured')
    return getAuthUrl(PROVIDER, process.env.CONSTANT_CONTACT_CLIENT_ID!, redirectUri, SCOPES, state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = createAdminClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.CONSTANT_CONTACT_CLIENT_ID!, process.env.CONSTANT_CONTACT_CLIENT_SECRET!)
      const encryptedToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null
      const { error: saveError } = await supabase.from('org_integrations').upsert({ org_id: orgId, provider: PROVIDER, status: 'connected', encrypted_refresh_token: encryptedToken, scopes: SCOPES, last_synced_at: new Date().toISOString() }, { onConflict: 'org_id,provider' })
      if (saveError) throw new Error(`${this.displayName} connect failed: ${saveError.message}`)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'handleCallback', err); throw err }
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
      const decrypted = decryptToken(data.encrypted_refresh_token)
      if (!decrypted) return null
      return refreshAccessToken(PROVIDER, decrypted, process.env.CONSTANT_CONTACT_CLIENT_ID!, process.env.CONSTANT_CONTACT_CLIENT_SECRET!)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async syncContacts(orgId: string, contacts: { email: string; firstName?: string; lastName?: string }[]): Promise<{ synced: number; errors: number }> {
    const token = await this.getAccessToken(orgId)
    if (!token) return { synced: 0, errors: 0 }

    let synced = 0
    let errors = 0

    for (const contact of contacts) {
      try {
        const res = await fetch('https://api.cc.email/v3/contacts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email_address: { address: contact.email, permission_to_send: 'implicit' },
            first_name: contact.firstName ?? '',
            last_name: contact.lastName ?? '',
            create_source: 'Account',
          }),
        })
        if (res.ok || res.status === 409) synced++
        else errors++
      } catch (err: any) {
        await logIntegrationError(orgId, PROVIDER, 'syncContacts', err, { email: contact.email })
        errors++
      }
    }
    return { synced, errors }
  }
}

export const constantContactAdapter = new ConstantContactAdapter()
export default constantContactAdapter
