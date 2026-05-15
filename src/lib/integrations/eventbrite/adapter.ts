/**
 * Eventbrite Integration Adapter
 *
 * OAuth App Registration Steps:
 * 1. Go to https://www.eventbrite.com/account-settings/apps
 * 2. Click "Create App", name it "Prezva"
 * 3. Set OAuth Redirect URI to: https://prezva.app/api/integrations/eventbrite/callback
 * 4. Required scopes: event_access, organizer_access
 * 5. Copy Client ID -> add EVENTBRITE_CLIENT_ID to Vercel env vars
 * 6. Copy Client Secret -> already in Vercel as EVENTBRITE_CLIENT_SECRET
 */
import type { IntegrationAdapter, IntegrationStatus } from '../_shared/adapter'
import { getAuthUrl, exchangeCodeForTokens } from '../_shared/oauth'
import { encryptToken, decryptToken } from '../_shared/encryption'
import { logIntegrationError } from '../_shared/sync-errors'
import { createClient } from '@/lib/supabase/server'

const PROVIDER = 'eventbrite'

class EventbriteAdapter implements IntegrationAdapter {
  readonly provider = PROVIDER
  readonly displayName = 'Eventbrite'

  isConfigured(): boolean {
    const id = process.env.EVENTBRITE_CLIENT_ID
    const secret = process.env.EVENTBRITE_CLIENT_SECRET
    return !!(id && id !== 'NEEDS_REGISTRATION' && secret && secret !== 'NEEDS_REGISTRATION')
  }

  getAuthUrl(orgId: string, redirectUri: string, state: string): string {
    const clientId = process.env.EVENTBRITE_CLIENT_ID
    if (!clientId || clientId === 'NEEDS_REGISTRATION') {
      throw new Error('Eventbrite CLIENT_ID not configured — see docs/production-secrets.md')
    }
    return getAuthUrl(PROVIDER, clientId, redirectUri, [], state)
  }

  async handleCallback(code: string, orgId: string, redirectUri: string): Promise<void> {
    const supabase = await createClient()
    try {
      const tokens = await exchangeCodeForTokens(PROVIDER, code, redirectUri, process.env.EVENTBRITE_CLIENT_ID!, process.env.EVENTBRITE_CLIENT_SECRET!)
      // Eventbrite returns long-lived access_token (no refresh)
      const encryptedToken = encryptToken(tokens.access_token)
      await supabase.from('org_integrations').upsert({ org_id: orgId, provider: PROVIDER, status: 'connected', encrypted_refresh_token: encryptedToken, last_synced_at: new Date().toISOString() }, { onConflict: 'org_id,provider' })
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

  private async getAccessToken(orgId: string): Promise<string | null> {
    const supabase = await createClient()
    const { data } = await supabase.from('org_integrations').select('encrypted_refresh_token').eq('org_id', orgId).eq('provider', PROVIDER).single()
    if (!data?.encrypted_refresh_token) return null
    try {
      return decryptToken(data.encrypted_refresh_token)
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'getAccessToken', err); return null }
  }

  async listOrganizerEvents(orgId: string): Promise<{ id: string; name: string; startDate: string; status: string }[]> {
    const token = await this.getAccessToken(orgId)
    if (!token) return []
    try {
      const res = await fetch('https://www.eventbriteapi.com/v3/users/me/events/?expand=none&status=live,started,ended,completed&page_size=50', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      return (data.events ?? []).map((e: any) => ({
        id: e.id,
        name: e.name?.text ?? '',
        startDate: e.start?.utc ?? '',
        status: e.status ?? '',
      }))
    } catch (err: any) { await logIntegrationError(orgId, PROVIDER, 'listOrganizerEvents', err); return [] }
  }

  async importAttendees(orgId: string, eventbriteEventId: string, prezvaEventId: string): Promise<{ imported: number; skipped: number; errors: number }> {
    const token = await this.getAccessToken(orgId)
    if (!token) return { imported: 0, skipped: 0, errors: 0 }

    const supabase = await createClient()
    let imported = 0
    let skipped = 0
    let errors = 0
    let continuation: string | null = null

    do {
      try {
        const url: string = continuation
          ? `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/attendees/?continuation=${continuation}`
          : `https://www.eventbriteapi.com/v3/events/${eventbriteEventId}/attendees/?page_size=200`
        const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error(await res.text())
        const data: Record<string, unknown> = await res.json()

        const attendees: any[] = (data.attendees as any[]) ?? []
        for (const a of attendees) {
          const email = a.profile?.email
          if (!email) { errors++; continue }

          const { data: existing } = await supabase
            .from('registrations')
            .select('id')
            .eq('event_id', prezvaEventId)
            .eq('email', email)
            .maybeSingle()

          if (existing) { skipped++; continue }

          const { error: insErr } = await supabase.from('registrations').insert({
            event_id: prezvaEventId,
            email,
            first_name: a.profile?.first_name ?? null,
            last_name: a.profile?.last_name ?? null,
            status: a.cancelled ? 'cancelled' : 'confirmed',
            source: 'eventbrite',
          })
          if (insErr) errors++
          else imported++
        }

        continuation = (data.pagination as any)?.continuation ?? null
      } catch (err: any) {
        await logIntegrationError(orgId, PROVIDER, 'importAttendees', err, { eventbriteEventId, prezvaEventId })
        errors++
        break
      }
    } while (continuation)

    await supabase.from('org_integrations').update({ last_synced_at: new Date().toISOString() }).eq('org_id', orgId).eq('provider', PROVIDER)
    return { imported, skipped, errors }
  }
}

export const eventbriteAdapter = new EventbriteAdapter()
export default eventbriteAdapter
