import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlPut, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { GHL_STAGE_TAGS, GHL_STAGE_SUPERSEDES_TAGS } from '@/lib/integrations/ghl/config'

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
      .select('id, status, ghl_opportunity_id, ghl_contact_id')
      .eq('internal_registration_id', registrationId)
      .maybeSingle()

    if (!syncState) {
      // Non-GHL registration — skip silently
      console.debug(`[ghl-stage-move] No sync state for registration ${registrationId} — skipping`)
      return { skipped: true }
    }

    let result: { applied: true; opportunityId: string } | { parked: true; syncStateId: string }

    if (syncState.status === 'synced' && syncState.ghl_opportunity_id) {
      const token = getGhlToken()
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

    const tag = GHL_STAGE_TAGS[stageId]
    if (tag && syncState.ghl_contact_id) {
      try {
        const token = getGhlToken()
        await ghlAddContactTags(token, syncState.ghl_contact_id, [tag])
      } catch (e) {
        console.error('[ghl-stage-move] tag apply failed (non-fatal):', e)
      }
    }

    const superseded = GHL_STAGE_SUPERSEDES_TAGS[stageId]
    if (superseded?.length && syncState.ghl_contact_id) {
      try {
        const token = getGhlToken()
        await ghlRemoveContactTags(token, syncState.ghl_contact_id, superseded)
      } catch (e) {
        console.error('[ghl-stage-move] superseded tag removal failed (non-fatal):', e)
      }
    }

    return result
  },
})
