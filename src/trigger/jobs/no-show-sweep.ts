import { schedules } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase-admin'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

const GRACE_MS = 2 * 60 * 60 * 1000
const LOOKBACK_MS = 6 * 60 * 60 * 1000

// Derived-state selection: a confirmed, GHL-linked registration counts as a
// no-show iff it has zero check-ins (event- or session-level both count as
// "showed up") and zero session_attendance rows. No no-show column/enum
// anywhere — this is computed fresh on every call, event-scoped only (no
// time window), so it can be exercised directly against any past event.
export async function findNoShowRegistrations(admin: SupabaseClient, eventId: string): Promise<string[]> {
  const { data: confirmed } = await admin
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const confirmedIds = (confirmed ?? []).map((r) => r.id)
  if (confirmedIds.length === 0) return []

  const { data: syncRows } = await admin
    .from('ghl_sync_state')
    .select('internal_registration_id, ghl_opportunity_id')
    .in('internal_registration_id', confirmedIds)
    .eq('status', 'synced')
    .eq('dead_lettered', false)

  const syncedIds = new Set(
    (syncRows ?? [])
      .filter((r) => !!r.ghl_opportunity_id)
      .map((r) => r.internal_registration_id),
  )
  const candidateIds = confirmedIds.filter((id) => syncedIds.has(id))
  if (candidateIds.length === 0) return []

  const { data: checkIns } = await admin
    .from('check_ins')
    .select('registration_id')
    .in('registration_id', candidateIds)

  const checkedInIds = new Set((checkIns ?? []).map((r) => r.registration_id))

  const { data: attendance } = await admin
    .from('session_attendance')
    .select('registration_id')
    .in('registration_id', candidateIds)

  const attendedIds = new Set((attendance ?? []).map((r) => r.registration_id))

  return candidateIds.filter((id) => !checkedInIds.has(id) && !attendedIds.has(id))
}

// Hourly: sweeps events whose end_at fell 2-6h ago for confirmed, GHL-linked
// registrations that never showed up, moving each to the GHL No Show stage.
// The window overlaps across runs by design — the ghl-stage-move PUT + tag
// add are idempotent, so re-sweeping an event already at No Show is a no-op
// and no claim/dedup column is needed.
export const noShowSweepTask = schedules.task({
  id: 'no-show-sweep',
  cron: '0 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = Date.now()
    const windowEnd = new Date(now - GRACE_MS).toISOString()
    const windowStart = new Date(now - LOOKBACK_MS).toISOString()

    const { data: events } = await admin
      .from('events')
      .select('id, org_id')
      .lt('end_at', windowEnd)
      .gt('end_at', windowStart)
      .neq('status', 'archived')

    if (!events?.length) return { eventsScanned: 0, registrationsEnqueued: 0 }

    let registrationsEnqueued = 0
    for (const event of events) {
      const regIds = await findNoShowRegistrations(admin, event.id)
      if (regIds.length === 0) continue

      const locationId = await ghlLocationIdForOrg(admin, event.org_id)
      if (!locationId) continue // org not GHL-linked — silent skip

      const config = await getGhlOrgConfig(admin, event.org_id)
      if (!config) {
        console.error(`[ghl] org ${event.org_id} is GHL-linked but has no ghl_org_config row — sync skipped`)
        continue
      }

      for (const registrationId of regIds) {
        try {
          await enqueueGhlStageMove({ registrationId, stageId: config.stageIds.noShow })
          registrationsEnqueued++
        } catch (e) {
          console.error('[no-show-sweep] enqueueGhlStageMove failed:', e)
        }
      }
    }

    return { eventsScanned: events.length, registrationsEnqueued }
  },
})
