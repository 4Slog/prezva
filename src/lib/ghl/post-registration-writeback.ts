import type { SupabaseClient } from '@supabase/supabase-js'
import { ghlPut, ghlPost } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

// Lifted out of the payment webhook route (R55 Batch 2) so the workflow
// transport and the app-webhook transport run ONE implementation rather than
// two copies that drift. Every value it needs is an explicit parameter — it
// closes over nothing — which is what makes it callable from a second route.

// Formats an event start timestamp as a calendar date in the event's OWN
// timezone. An 8pm March 14 America/New_York event is March 15 in UTC, so
// formatting in UTC would make every reminder fire a day late. Returns null
// rather than throwing or falling back to UTC — a missing date is honest, a
// wrong date is not.
export function eventDateInEventTz(startAt: string | null, timeZone: string | null): string | null {
  if (!startAt || !timeZone) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(startAt))
  } catch {
    return null
  }
}

export interface PostRegistrationWritebackParams {
  supabase: SupabaseClient
  orgId: string
  syncStateId: string
  locationId: string
  contactId: string
  entryUrl: string
  eventTitle: string | null
  eventStartAt: string | null
  eventEndAt: string | null
  eventTimezone: string | null
  /** Log prefix so each transport stays identifiable in production logs. */
  logTag?: string
}

// Best-effort: write entryUrl into the GHL contact so the GHL "Send Email"
// workflow step can link to it via {{contact.prezva_attendee_link}}. Synchronous
// (before the route's 200) so the field is deterministically set before the
// workflow proceeds. Non-fatal throughout: a GHL hiccup must never fail an
// otherwise-accepted registration.
export async function postRegistrationWriteback(
  params: PostRegistrationWritebackParams,
): Promise<void> {
  const {
    supabase, orgId, syncStateId, locationId, contactId, entryUrl,
    eventTitle, eventStartAt, eventEndAt, eventTimezone,
  } = params
  const tag = params.logTag ?? '[ghl-payment]'

  try {
    // The caller has already established GHL linkage for this org, so a null
    // config here is always the "linked but unprovisioned" case, not "not linked."
    const config = await getGhlOrgConfig(supabase, orgId)
    if (!config) {
      console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      return
    }

    const token = await ghlAdapter.getAccessToken(orgId)
    if (!token) {
      console.error(`${tag} no GHL access token for org ${orgId} — entryUrl not written to contact`, contactId)
      await supabase
        .from('ghl_sync_state')
        .update({ last_error: `no_ghl_access_token: org ${orgId}`, updated_at: new Date().toISOString() })
        .eq('id', syncStateId)
      return
    }

    const eventDate = eventDateInEventTz(eventStartAt, eventTimezone)
    const customFields: Array<{ id: string; value: string }> = [
      { id: config.fieldIds.prezvaAttendeeLink, value: entryUrl },
    ]
    if (eventDate && config.fieldIds.prezvaEventDate) {
      customFields.push({ id: config.fieldIds.prezvaEventDate, value: eventDate })
    }
    await ghlPut(token, `/contacts/${contactId}`, { customFields })

    // Appointment per registration: GHL's native calendar notifications (booking
    // confirmation, pre-event reminder, post-event follow-up) are the reminder
    // backbone. calendarId null => org has no adopted calendar => skip silently.
    // ignoreDateRange + ignoreFreeSlotValidation are REQUIRED: they bypass slot
    // availability/capacity so an arbitrary-time, multi-day event appointment
    // returns 201. endTime always from events.end_at — Follow-Up fires relative
    // to the END. Title is the EVENT name (grid shows title only; list view has
    // a Contact column and searches by title).
    if (config.calendarId && contactId && eventStartAt && eventEndAt) {
      // IDEMPOTENCY GUARD (R55 Batch 2). Appointment creation is the one step in
      // this chain with no natural dedup: the registration is protected by a
      // unique external_order_id and the contact PUT is idempotent, but a second
      // POST here books a SECOND calendar appointment and re-fires GHL's booking
      // confirmation and reminders at the attendee. Retries are now routine — GHL
      // app webhooks retry any non-2xx up to 12 times, and during the transition
      // both transports fire per order — so re-entry before the sync task flips
      // the row to 'synced' is expected, not exotic. Read the id we already
      // stored and skip if it's there.
      const { data: existingAppt } = await supabase
        .from('ghl_sync_state')
        .select('ghl_appointment_id')
        .eq('id', syncStateId)
        .maybeSingle()

      if (existingAppt?.ghl_appointment_id) {
        console.log(
          `${tag} appointment already created for sync state ${syncStateId} (${existingAppt.ghl_appointment_id}) — skipping duplicate booking`,
        )
        return
      }

      try {
        const appt = await ghlPost<{ id?: string; appointment?: { id?: string } }>(
          token,
          '/calendars/events/appointments',
          {
            calendarId: config.calendarId,
            locationId,
            contactId,
            startTime: eventStartAt,
            endTime: eventEndAt,
            title: eventTitle,
            ignoreDateRange: true,
            ignoreFreeSlotValidation: true,
          },
        )
        const apptId = appt?.id ?? appt?.appointment?.id ?? null
        if (apptId) {
          await supabase
            .from('ghl_sync_state')
            .update({ ghl_appointment_id: apptId })
            .eq('id', syncStateId)
        }
      } catch (e) {
        console.error('ghl appointment create failed (non-fatal)', e)
      }
    }
  } catch (e) {
    console.error(`${tag} failed to write entryUrl to contact`, contactId, e)
  }
}
