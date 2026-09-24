import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

// Server-only: called by the GHL webhook routes after they verify the webhook
// secret. It trusts its params, so it must never be a server-action export.

// ── GHL inbound registration (provider-agnostic, already-confirmed payment) ──

export interface CreateRegistrationFromExternalPaymentParams {
  eventId: string;
  ticketTypeId: string;
  attendeeEmail: string;
  attendeeName: string;
  attendeePhone?: string | null;
  amountPaidCents: number;
  currency?: string;
  externalSource: string;
  externalOrderId: string;
  paymentGateway: string;
  /**
   * GHL Events attendee id. Its PRESENCE selects the Events lane: dedupe moves to
   * registrations.ghl_attendee_id and external_order_id is written null.
   *
   * One GHL Events order can carry several attendees. external_order_id is UNIQUE,
   * so deduping that order on the order id would match the first attendee's row and
   * hand attendee two attendee one's registration as success:true. The attendee id
   * is the only per-seat identifier GHL gives us.
   */
  ghlAttendeeId?: string;
  /** The order the attendee was bought under. Recorded, never deduped on. */
  ghlOrderId?: string;
}

export type CreateRegistrationFromExternalPaymentResult =
  | { success: true; registrationId: string; qrCode: string; appAccessToken: string }
  | { success: false; error: string; waitlisted?: boolean }

// Which unique key a 23505 actually violated.
//
// Probed live against this database on 2026-09-14 rather than assumed, for both a
// plain constraint and a partial expression index:
//   MESSAGE = duplicate key value violates unique constraint "<name>"
//   DETAIL  = Key (col)=(val) already exists.        <- carries NO constraint name
// Both shapes are identical, so one pattern covers all four unique keys on
// registrations. PostgREST does not forward PG's CONSTRAINT_NAME diagnostic as its
// own field: PostgrestError carries message/details/hint/code and nothing else, so
// `message` is the only place the name arrives. `details` is scanned as well, purely
// so a future PostgREST that relocates the name degrades to the generic branch
// loudly rather than silently.
function violatedUniqueConstraint(error: { message?: string; details?: string | null }): string | null {
  const pattern = /violates unique constraint "([^"]+)"/
  return (pattern.exec(error.message ?? '') ?? pattern.exec(error.details ?? ''))?.[1] ?? null
}

export async function createRegistrationFromExternalPayment(
  params: CreateRegistrationFromExternalPaymentParams,
): Promise<CreateRegistrationFromExternalPaymentResult> {
  const supabase = createAdminClient()

  // Idempotency, keyed by whichever identifier is per-registration in this lane:
  // the attendee id for GHL Events, the order id everywhere else.
  const { data: existing } = params.ghlAttendeeId
    ? await supabase
        .from('registrations')
        .select('id, qr_code, app_access_token')
        .eq('ghl_attendee_id', params.ghlAttendeeId)
        .maybeSingle()
    : await supabase
        .from('registrations')
        .select('id, qr_code, app_access_token')
        .eq('external_order_id', params.externalOrderId)
        .maybeSingle()

  if (existing) {
    return { success: true, registrationId: existing.id, qrCode: existing.qr_code, appAccessToken: existing.app_access_token }
  }

  // Insert directly as confirmed/paid. DB trigger trg_enforce_capacity fires before insert.
  // If at capacity the trigger raises — catch it and return waitlisted.
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('registrations')
    .insert({
      event_id:             params.eventId,
      ticket_type_id:       params.ticketTypeId,
      user_id:              null,
      attendee_email:       params.attendeeEmail,
      attendee_name:        params.attendeeName,
      attendee_phone:       params.attendeePhone ?? null,
      attendee_company:     null,
      attendee_job_title:   null,
      status:               'confirmed',
      amount_paid_cents:    params.amountPaidCents,
      discount_code_id:     null,
      confirmation_sent_at: now,
      delivery_method:      'in_person',
      press_token:          null,
      sms_opt_in:           false,
      sms_opt_in_at:        null,
      // Exactly one of these identifies the row. In the Events lane the order is
      // shared by every seat on it, so it is recorded on ghl_order_id and must NOT
      // occupy the UNIQUE external_order_id — that column would reject seat two.
      external_order_id:    params.ghlAttendeeId ? null : params.externalOrderId,
      ghl_attendee_id:      params.ghlAttendeeId ?? null,
      ghl_order_id:         params.ghlOrderId ?? null,
    })
    .select('id, qr_code, app_access_token')
    .single()

  if (error) {
    if (error.message?.toLowerCase().includes('capacity') || error.code === 'P0001') {
      return { success: false, error: 'Event is at capacity', waitlisted: true }
    }

    // Lost the race (R55 Batch 2). The read above is a fast path, not a lock —
    // two concurrent deliveries can both miss it and both insert. A unique key is
    // the real guard, and 23505 means someone else got there first.
    //
    // This matters more than it used to: GHL app webhooks retry any non-2xx up
    // to 12 times, and during the transition both transports fire per order.
    // Reporting a duplicate as a failure would 500, which GHL then retries —
    // turning a benign race into a retry storm against a row that is already
    // correct.
    //
    // WHICH key was violated now decides the answer, because four can raise 23505
    // here and they do not mean the same thing. Recovering by re-reading the
    // dedupe key is only correct when the dedupe key is what collided; doing it
    // blind on an email collision would return a DIFFERENT attendee's registration.
    if (error.code === '23505') {
      const constraint = violatedUniqueConstraint(error)

      // Two attendees on one order sharing an email address. Real, and untested
      // until now: GHL lets one buyer register several people, and nothing stops
      // them reusing their own address. Refuse under a name the caller can record.
      // Never re-read here — every row these two keys match belongs to someone
      // else, so a re-read would hand back the wrong person's registration.
      if (
        constraint === 'registrations_event_email_unique' ||
        constraint === 'registrations_no_duplicate_idx'
      ) {
        return { success: false, error: 'duplicate_attendee_email_on_event' }
      }

      // The dedupe key for THIS call collided: the other writer's row is the row
      // this call wanted. Return it, exactly as the read path would have.
      if (params.ghlAttendeeId) {
        if (constraint === 'registrations_ghl_attendee_id_key') {
          const { data: raced } = await supabase
            .from('registrations')
            .select('id, qr_code, app_access_token')
            .eq('ghl_attendee_id', params.ghlAttendeeId)
            .maybeSingle()

          if (raced) {
            return { success: true, registrationId: raced.id, qrCode: raced.qr_code, appAccessToken: raced.app_access_token }
          }
        }
      } else if (constraint === 'registrations_external_order_id_key') {
        const { data: raced } = await supabase
          .from('registrations')
          .select('id, qr_code, app_access_token')
          .eq('external_order_id', params.externalOrderId)
          .maybeSingle()

        if (raced) {
          return { success: true, registrationId: raced.id, qrCode: raced.qr_code, appAccessToken: raced.app_access_token }
        }
      }
      // An unrecognised constraint, or the row vanished between the conflict and
      // this read — fall through and report honestly rather than inventing a
      // success.
    }

    return { success: false, error: error.message }
  }

  return { success: true, registrationId: data.id, qrCode: data.qr_code, appAccessToken: data.app_access_token }
}
