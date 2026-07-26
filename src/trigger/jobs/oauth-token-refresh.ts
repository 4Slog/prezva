import { schedules } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase-admin'
import { getAdapter } from '@/lib/integrations/_shared/registry'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'

// Candidates are 'connected' (normal refresh) or 'error' (a previous
// attempt failed and the catch block below marked it) — 'error' must stay
// eligible or the first failure permanently drops the row from this job's
// own candidate set. The lower bound (expiredAfter) exists because
// ghlAdapter.getAccessToken cannot yet distinguish a revoked grant from a
// transient failure: it's a single `!res.ok` check with no status-code or
// error-body inspection (src/lib/integrations/ghl/adapter.ts), so both
// write the same 'error' status. Age is the only proxy available today for
// "this grant is dead" — without it, a permanently-uninstalled integration
// (status='error' forever, since disconnect() hard-deletes the row instead
// of marking it) would retry against GHL's token endpoint every 5 minutes
// indefinitely.
export async function findExpiringIntegrations(
  admin: SupabaseClient,
  expiringBefore: string,
  expiredAfter: string,
) {
  const { data } = await admin
    .from('org_integrations')
    .select('id, org_id, provider, token_expires_at')
    .in('status', ['connected', 'error'])
    .lte('token_expires_at', expiringBefore)
    .gte('token_expires_at', expiredAfter)
    .limit(20)

  return data ?? []
}

// Runs every 5 minutes — refreshes tokens expiring within 10 minutes
export const oauthTokenRefreshTask = schedules.task({
  id: 'oauth-token-refresh',
  cron: '*/5 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = Date.now()
    const tenMinutesFromNow = new Date(now + 10 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()

    const expiring = await findExpiringIntegrations(admin, tenMinutesFromNow, sevenDaysAgo)

    if (!expiring.length) return { refreshed: 0 }

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
