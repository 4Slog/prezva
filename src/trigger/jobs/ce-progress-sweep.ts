import { schedules } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlPut, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { GHL_LIFECYCLE_TAGS } from '@/lib/integrations/ghl/config'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import { checkEligibility } from '@/lib/certificates/eligibility'

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000

export type CeProgressCandidate = {
  registrationId: string
  syncStateId: string
  ghlOpportunityId: string
  ghlContactId: string | null
  lastPushedAttendancePct: number | null
  lastPushedCeCredits: number | null
}

// Derived-state selection: a confirmed, GHL-linked (opportunity present)
// registration for one event is a CE-progress candidate. Event-scoped only
// (no time window), so it can be exercised directly against any past event.
// Rows without an opportunity are parked by the create-sync job — skip them.
export async function findCeProgressCandidates(admin: SupabaseClient, eventId: string): Promise<CeProgressCandidate[]> {
  const { data: confirmed } = await admin
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const confirmedIds = (confirmed ?? []).map((r) => r.id)
  if (confirmedIds.length === 0) return []

  const { data: syncRows } = await admin
    .from('ghl_sync_state')
    .select('id, internal_registration_id, ghl_opportunity_id, ghl_contact_id, last_pushed_attendance_pct, last_pushed_ce_credits')
    .in('internal_registration_id', confirmedIds)
    .eq('status', 'synced')

  return (syncRows ?? [])
    .filter((r) => !!r.ghl_opportunity_id)
    .map((r) => ({
      registrationId: r.internal_registration_id as string,
      syncStateId: r.id,
      ghlOpportunityId: r.ghl_opportunity_id as string,
      ghlContactId: r.ghl_contact_id,
      lastPushedAttendancePct: r.last_pushed_attendance_pct,
      lastPushedCeCredits: r.last_pushed_ce_credits,
    }))
}

export type CeProgressResult =
  | { skipped: true; reason: 'unchanged' }
  | { updated: true; pct: number; credits: number }

// Pushes one registration's attendance%/CE-credits to its GHL opportunity and
// keeps the ce-incomplete drip tag in sync. Dedups against the last-pushed
// values so an unchanged registration produces zero GHL calls.
export async function processCeProgressCandidate(
  admin: SupabaseClient,
  token: string,
  candidate: CeProgressCandidate,
  config: GhlOrgConfig,
): Promise<CeProgressResult> {
  const el = await checkEligibility(candidate.registrationId)
  const pct = el.sessionsTotal > 0 ? Math.round((el.sessionsAttended / el.sessionsTotal) * 100) : 0
  const credits = el.ceCredits

  if (pct === candidate.lastPushedAttendancePct && credits === candidate.lastPushedCeCredits) {
    return { skipped: true, reason: 'unchanged' }
  }

  await ghlPut(token, `/opportunities/${candidate.ghlOpportunityId}`, {
    customFields: [
      { id: config.fieldIds.prezvaAttendancePct, value: pct },
      { id: config.fieldIds.prezvaCeCredits, value: credits },
    ],
  })

  if (candidate.ghlContactId) {
    if (!el.eligible && el.sessionsAttended > 0) {
      await ghlAddContactTags(token, candidate.ghlContactId, [GHL_LIFECYCLE_TAGS.ceIncomplete])
    } else if (el.eligible) {
      await ghlRemoveContactTags(token, candidate.ghlContactId, [GHL_LIFECYCLE_TAGS.ceIncomplete])
    }
    // sessionsAttended === 0 (real no-show): touch the tag not at all.
  }

  await admin
    .from('ghl_sync_state')
    .update({
      last_pushed_attendance_pct: pct,
      last_pushed_ce_credits: credits,
      updated_at: new Date().toISOString(),
    })
    .eq('id', candidate.syncStateId)

  return { updated: true, pct, credits }
}

// Runs the full candidate-selection + per-registration push for one event, no
// time filter — the piece no-show-sweep's findNoShowRegistrations mirrors.
// One registration's failure is caught and logged; it never aborts the rest.
export async function runCeProgressSweepForEvent(
  admin: SupabaseClient,
  token: string,
  eventId: string,
): Promise<{ processed: number; updated: number }> {
  const { data: eventRow } = await admin.from('events').select('org_id').eq('id', eventId).maybeSingle()
  const orgId = eventRow?.org_id
  if (!orgId) return { processed: 0, updated: 0 }

  const locationId = await ghlLocationIdForOrg(admin, orgId)
  if (!locationId) return { processed: 0, updated: 0 } // org not GHL-linked — silent skip

  const config = await getGhlOrgConfig(admin, orgId)
  if (!config) {
    console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
    return { processed: 0, updated: 0 }
  }

  const candidates = await findCeProgressCandidates(admin, eventId)
  let updated = 0
  for (const candidate of candidates) {
    try {
      const result = await processCeProgressCandidate(admin, token, candidate, config)
      if ('updated' in result) updated++
    } catch (e) {
      console.error('[ce-progress-sweep] processCeProgressCandidate failed:', candidate.registrationId, e)
    }
  }
  return { processed: candidates.length, updated }
}

// Daily: sweeps events whose end_at fell in the last 14 days for confirmed,
// GHL-linked registrations, pushing attendance%/CE-credits so GHL replay-nurture
// workflows can act on them. Runs off the hourly no-show sweep's :00.
export const ceProgressSweepTask = schedules.task({
  id: 'ce-progress-sweep',
  cron: '30 3 * * *',
  run: async () => {
    const admin = createAdminClient()
    const token = getGhlToken()
    const now = Date.now()
    const windowEnd = new Date(now).toISOString()
    const windowStart = new Date(now - WINDOW_MS).toISOString()

    const { data: events } = await admin
      .from('events')
      .select('id')
      .lt('end_at', windowEnd)
      .gt('end_at', windowStart)
      .neq('status', 'archived')

    if (!events?.length) return { eventsScanned: 0, registrationsProcessed: 0, registrationsUpdated: 0 }

    let registrationsProcessed = 0
    let registrationsUpdated = 0
    for (const event of events) {
      const { processed, updated } = await runCeProgressSweepForEvent(admin, token, event.id)
      registrationsProcessed += processed
      registrationsUpdated += updated
    }

    return { eventsScanned: events.length, registrationsProcessed, registrationsUpdated }
  },
})
