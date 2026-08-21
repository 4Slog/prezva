import { schemaTask } from '@trigger.dev/sdk'
import { z } from 'zod'
import { createAdminClient } from '../lib/supabase-admin'
import { ghlPost, ghlPut, ghlAddContactTags } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { buildEventTag, GHL_LIFECYCLE_TAGS } from '@/lib/integrations/ghl/config'
import { ghlOrgIdForLocation } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

/**
 * GHL refuses a second open opportunity for the same contact on the same
 * pipeline with `400 OPPORTUNITY_NO_DUPLICATE`, and hands the winner's id back
 * in `meta.existingId`. That is not a failure for us — the opportunity we
 * wanted exists — so the run adopts the id and continues.
 *
 * ghlPost throws `Error('GHL POST <path> failed: <status> — <raw body>')`, so
 * the body has to be recovered from the message. Parsing is deliberately
 * defensive: anything we cannot positively read as this specific duplicate
 * error returns null and the caller rethrows.
 */
export function adoptedDuplicateOpportunityId(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err)

  // Both gates are mandatory. A message we cannot read a status out of is a
  // message whose shape we no longer recognise, and `includes` would otherwise
  // match the code anywhere in any string — including an error that merely
  // quotes an earlier body.
  const status = message.match(/failed: (\d{3})\b/)
  if (!status || status[1] !== '400') return null
  if (!message.includes('OPPORTUNITY_NO_DUPLICATE')) return null

  const bodyStart = message.indexOf('{')
  if (bodyStart !== -1) {
    try {
      const parsed = JSON.parse(message.slice(bodyStart)) as { meta?: { existingId?: unknown } }
      const existingId = parsed?.meta?.existingId
      if (typeof existingId === 'string' && existingId.length > 0) return existingId
    } catch {
      // Body was truncated or not JSON — fall through to the literal scan,
      // which still finds the id in a partially mangled payload.
    }
  }

  const scanned = message.match(/"existingId"\s*:\s*"([^"]+)"/)
  return scanned ? scanned[1] : null
}

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

    // Duplicate executions of this job are real: the two webhook transports can
    // both enqueue off one GHL order, and Trigger.dev can retry an attempt.
    // This job writes ghl_opportunity_id back itself, so finding one already on
    // the row means a prior execution created the opportunity — creating a
    // second one is neither possible nor wanted, so skip the POST and run the
    // rest against the id we already have.
    const { data: priorSync, error: priorSyncErr } = await admin
      .from('ghl_sync_state')
      .select('ghl_opportunity_id')
      .eq('id', payload.syncStateId)
      .single()

    // A read that failed is not a read that found nothing. Treating an errored
    // or missing row as "no opportunity yet" would send the guard fail-open
    // straight into the duplicate POST it exists to prevent — and once the
    // earlier opportunity has been moved to won/lost, GHL stops calling it a
    // duplicate and happily creates a real second one.
    if (priorSyncErr || !priorSync) {
      throw new Error(
        `[ghl-sync] could not read ghl_sync_state ${payload.syncStateId}: ${priorSyncErr?.message ?? 'row not found'}`,
      )
    }

    let ghlOpportunityId: string | null = priorSync.ghl_opportunity_id ?? null

    try {
      if (!ghlOpportunityId) {
        try {
          const result = await ghlPost<{ opportunity?: { id?: string }; id?: string }>(
            token,
            '/opportunities/',
            opportunityBody,
          )
          ghlOpportunityId = result.opportunity?.id ?? (result as { id?: string }).id ?? null
        } catch (postErr: unknown) {
          // Belt to the guard's braces: the guard loses to a genuinely
          // concurrent execution that has not written its id back yet, and GHL
          // itself is then the arbiter. Adopting its answer keeps this run on
          // the success path; anything else is a real failure.
          const adopted = adoptedDuplicateOpportunityId(postErr)
          if (!adopted) throw postErr

          // GHL's duplicate rule is per contact+pipeline, not per registration:
          // a repeat attendee registering for a second event while their first
          // opportunity is still open earns this same 400, carrying the *first*
          // event's id. Adopting that would point two registrations at one
          // opportunity — silently wrong. An id another sync row already owns
          // is therefore a genuine failure that a human has to settle, so it
          // stays loud. (Our own row can't be the owner here: the guard above
          // would have skipped the POST.)
          // A probe that errors tells us nothing, so it counts as "do not
          // adopt" — failing open here would produce the exact outcome the
          // probe exists to stop. Any throw from the client is caught for the
          // same reason, and so that a DB error cannot replace postErr as the
          // recorded last_error and cost us the GHL diagnostic.
          let ownedElsewhere = true
          try {
            const { data: otherOwner, error: probeErr } = await admin
              .from('ghl_sync_state')
              .select('id')
              .eq('ghl_opportunity_id', adopted)
              .neq('id', payload.syncStateId)
              .limit(1)
              .maybeSingle()
            if (probeErr) {
              console.error(`[ghl-sync] ownership probe for ${adopted} failed:`, probeErr)
            } else if (otherOwner) {
              console.error(
                `[ghl-sync] opportunity ${adopted} is already owned by sync_state ${otherOwner.id} — refusing to adopt it for ${payload.syncStateId}`,
              )
            } else {
              ownedElsewhere = false
            }
          } catch (probeThrow) {
            console.error(`[ghl-sync] ownership probe for ${adopted} threw:`, probeThrow)
          }
          if (ownedElsewhere) throw postErr

          console.warn(
            `[ghl-sync] opportunity already existed for sync_state ${payload.syncStateId} — adopted ${adopted}`,
          )
          ghlOpportunityId = adopted
        }
      }

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

      // The UPDATE below is deliberately a no-op on an already-synced row, so
      // this log is the only record a post-synced failure leaves in the ledger.
      console.error(`[ghl-sync] run failed for sync_state ${payload.syncStateId}:`, err)

      const { data: current } = await admin
        .from('ghl_sync_state')
        .select('retries')
        .eq('id', payload.syncStateId)
        .single()

      const retries = (current?.retries ?? 0) + 1
      const deadLettered = retries >= 3

      // A later execution failing must never overwrite an earlier one that
      // completed: GHL and the registration are already correct, and only the
      // ledger would be lying. The `synced` exclusion lives in the WHERE of the
      // one UPDATE rather than in a read-then-write, so a concurrent execution
      // cannot slip its own synced write in between the check and the stamp.
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
        .neq('status', 'synced')

      throw err
    }
  },
})
