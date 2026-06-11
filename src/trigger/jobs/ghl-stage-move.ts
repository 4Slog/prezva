import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlPut } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'

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
      .select('id, status, ghl_opportunity_id')
      .eq('internal_registration_id', registrationId)
      .maybeSingle()

    if (!syncState) {
      // Non-GHL registration — skip silently
      console.debug(`[ghl-stage-move] No sync state for registration ${registrationId} — skipping`)
      return { skipped: true }
    }

    if (syncState.status === 'synced' && syncState.ghl_opportunity_id) {
      const token = getGhlToken()
      await ghlPut(token, `/opportunities/${syncState.ghl_opportunity_id}`, {
        pipelineStageId: stageId,
      })
      return { applied: true, opportunityId: syncState.ghl_opportunity_id }
    }

    // Opportunity not created yet — park the stage for the create-sync job to apply
    await admin
      .from('ghl_sync_state')
      .update({ pending_stage_id: stageId, updated_at: new Date().toISOString() })
      .eq('id', syncState.id)

    return { parked: true, syncStateId: syncState.id }
  },
})
