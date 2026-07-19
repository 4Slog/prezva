import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '../lib/supabase-admin'
import { getAdapter } from '@/lib/integrations/_shared/registry'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'

// Runs every 5 minutes — refreshes tokens expiring within 10 minutes
export const oauthTokenRefreshTask = schedules.task({
  id: 'oauth-token-refresh',
  cron: '*/5 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { data: expiring } = await admin
      .from('org_integrations')
      .select('id, org_id, provider, token_expires_at')
      .eq('status', 'connected')
      .not('token_expires_at', 'is', null)
      .lte('token_expires_at', tenMinutesFromNow)
      .limit(20)

    if (!expiring?.length) return { refreshed: 0 }

    let refreshed = 0
    for (const integration of expiring) {
      try {
        if (integration.provider === 'ghl') {
          await ghlAdapter.getAccessToken(integration.org_id)
          refreshed++
          continue
        }
        const adapter = getAdapter(integration.provider)
        // NOTE: getStatus is a pure DB read, not a refresh — this path is a known pre-existing no-op, tracked separately from the GHL branch above.
        await adapter.getStatus(integration.org_id)
        refreshed++
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`[oauth-refresh] Failed to refresh ${integration.provider} for org ${integration.org_id}:`, msg)
        await admin
          .from('org_integrations')
          .update({ status: 'error' })
          .eq('id', integration.id)
          .then(() => {}, () => {})
      }
    }

    return { checked: expiring.length, refreshed }
  },
})
