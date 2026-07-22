import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlPut, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlOrgIdForLocation } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

export const ghlStageMoveTask = schemaTask({
  id: 'ghl-stage-move',
  schema: z.object({
    registrationId: z.string(),
    stageId: z.string(),
  }),
  run: async (payload) => {
    const { registrationId, stageId } = payload
    const admin = createAdminClient()

    const { data: syncState } = await admin
      .from('ghl_sync_state')
      .select('id, status, ghl_opportunity_id, ghl_contact_id, location_id')
      .eq('internal_registration_id', registrationId)
      .maybeSingle()

    if (!syncState) {
      // Non-GHL registration — skip silently
      console.debug(`[ghl-stage-move] No sync state for registration ${registrationId} — skipping`)
      return { skipped: true }
    }

    // A ghl_sync_state row only exists for already-linked orgs — GHL-linkage
    // is implied, so a null orgId/token here is always the "linked but
    // unprovisioned/token-broken" case, not "not linked."
    const orgId = syncState.location_id ? await ghlOrgIdForLocation(admin, syncState.location_id) : null
    if (!orgId) throw new Error(`No org resolved for GHL location ${syncState.location_id ?? 'unknown'}`)

    const token = await ghlAdapter.getAccessToken(orgId)
    if (!token) throw new Error(`No GHL access token available for org ${orgId}`)

    let result: { applied: true; opportunityId: string } | { parked: true; syncStateId: string }

    if (syncState.status === 'synced' && syncState.ghl_opportunity_id) {
      await ghlPut(token, `/opportunities/${syncState.ghl_opportunity_id}`, {
        pipelineStageId: stageId,
      })
      result = { applied: true, opportunityId: syncState.ghl_opportunity_id }
    } else {
      // Opportunity not created yet — park the stage for the create-sync job to apply
      await admin
        .from('ghl_sync_state')
        .update({ pending_stage_id: stageId, updated_at: new Date().toISOString() })
        .eq('id', syncState.id)
      result = { parked: true, syncStateId: syncState.id }
    }

    // Only the tag maps depend on config — the stage PUT/park above already
    // ran unconditionally (it only needs the token resolved above, not config).
    const config = await getGhlOrgConfig(admin, orgId)

    if (!config) {
      console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      return result
    }

    const tag = config.stageTags[stageId]
    if (tag && syncState.ghl_contact_id) {
      try {
        await ghlAddContactTags(token, syncState.ghl_contact_id, [tag])
      } catch (e) {
        console.error('[ghl-stage-move] tag apply failed (non-fatal):', e)
      }
    }

    const superseded = config.stageSupersedesTags[stageId]
    if (superseded?.length && syncState.ghl_contact_id) {
      try {
        await ghlRemoveContactTags(token, syncState.ghl_contact_id, superseded)
      } catch (e) {
        console.error('[ghl-stage-move] superseded tag removal failed (non-fatal):', e)
      }
    }

    return result
  },
})
