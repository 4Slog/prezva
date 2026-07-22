import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlPost, ghlPut, ghlAddContactTags } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { buildEventTag, GHL_LIFECYCLE_TAGS } from '@/lib/integrations/ghl/config'
import { ghlOrgIdForLocation } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

export const ghlSyncTask = schemaTask({
  id: 'sync-ghl-registration',
  schema: z.object({
    registrationId:  z.string(),
    ghlLocationId:   z.string(),
    ghlContactId:    z.string(),
    ghlOrderId:      z.string(),
    ticketTypeTitle: z.string(),
    eventId:         z.string(),
    eventTitle:      z.string(),
    eventSlug:       z.string(),
    attendeeName:    z.string(),
    amountPaidCents: z.number(),
    paymentStatus:   z.string(),
    syncStateId:     z.string(),
  }),
  run: async (payload) => {
    const admin = createAdminClient()

    // This job only ever runs off a ghlLocationId already validated by the
    // payment webhook — GHL-linkage is implied, so a null config here is
    // always the "linked but unprovisioned" case, not "not linked."
    const orgId = await ghlOrgIdForLocation(admin, payload.ghlLocationId)
    const config = orgId ? await getGhlOrgConfig(admin, orgId) : null
    if (!config) {
      console.error(`[ghl] org ${orgId ?? payload.ghlLocationId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      return { skipped: true }
    }

    const token = await ghlAdapter.getAccessToken(orgId!)
    if (!token) throw new Error(`No GHL access token available for org ${orgId}`)

    const opportunityBody = {
      pipelineId:      config.pipelineId,
      pipelineStageId: config.stageIds.confirmed,
      name:            `[Prezva] ${payload.eventTitle} — ${payload.attendeeName}`,
      status:          'open',
      contactId:       payload.ghlContactId,
      monetaryValue:   payload.amountPaidCents / 100,
      customFields: [
        { id: config.fieldIds.prezvaEventId,        value: payload.eventId },
        { id: config.fieldIds.prezvaRegistrationId, value: payload.registrationId },
        { id: config.fieldIds.prezvaTicketType,     value: payload.ticketTypeTitle },
        { id: config.fieldIds.prezvaPaymentStatus,  value: payload.paymentStatus },
        { id: config.fieldIds.prezvaSource,         value: 'ghl_payment' },
        { id: config.fieldIds.prezvaLastSyncTime,   value: new Date().toISOString() },
      ],
      locationId: payload.ghlLocationId,
    }

    try {
      const result = await ghlPost<{ opportunity?: { id?: string }; id?: string }>(
        token,
        '/opportunities/',
        opportunityBody,
      )

      const ghlOpportunityId = result.opportunity?.id ?? (result as any).id ?? null

      await admin
        .from('ghl_sync_state')
        .update({
          status:             'synced',
          ghl_opportunity_id: ghlOpportunityId,
          updated_at:         new Date().toISOString(),
        })
        .eq('id', payload.syncStateId)

      try {
        const tags: string[] = [GHL_LIFECYCLE_TAGS.confirmed]
        if (payload.eventSlug) tags.push(buildEventTag(payload.eventSlug))
        await ghlAddContactTags(token, payload.ghlContactId, tags)
      } catch (e) {
        console.error('[ghl-sync] tag apply failed (non-fatal):', e)
      }

      // Self-heal: if a check-in arrived before the opportunity was created,
      // apply the parked stage now that we have the opportunity id.
      if (ghlOpportunityId) {
        const { data: syncRow } = await admin
          .from('ghl_sync_state')
          .select('pending_stage_id')
          .eq('id', payload.syncStateId)
          .single()
        if (syncRow?.pending_stage_id) {
          try {
            await ghlPut(token, `/opportunities/${ghlOpportunityId}`, {
              pipelineStageId: syncRow.pending_stage_id,
            })
          } catch (e) {
            console.error('[ghl-sync] pending_stage_id apply failed:', e)
          }
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)

      const { data: current } = await admin
        .from('ghl_sync_state')
        .select('retries')
        .eq('id', payload.syncStateId)
        .single()

      const retries = (current?.retries ?? 0) + 1
      const deadLettered = retries >= 3

      await admin
        .from('ghl_sync_state')
        .update({
          retries,
          last_error:    message,
          status:        'failed',
          dead_lettered: deadLettered,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', payload.syncStateId)

      throw err
    }
  },
})
