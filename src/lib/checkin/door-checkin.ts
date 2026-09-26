import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { doorRefusal, doorRefusalMessage } from '@/lib/checkin/admission'
import { isUniqueViolation } from '@/lib/checkin/offline-sync'
import { logAudit } from '@/lib/audit/log'
import type { CheckInResult, OfflineWrite } from '@/lib/checkin/types'

// Core door QR write, shared by the staff online scan, the staff offline sync
// (R84) and the volunteer portal (O153). NOT a server action: this module is
// server-only and has no 'use server', so it is never callable from a client.
// Every caller has already authorised the actor for the event — staff via
// checkin.manage, volunteers via their portal token and check-in role.
//
// The online scan passes no `offline` and writes exactly as before (checked_in_at
// is the database default, now). The offline sync passes the resolved scan time
// and the R87 columns, and throws on a database failure so the entry is
// retried, not refused.

export const QR_NOT_FOUND_FOR_EVENT = 'QR code not found for this event'
export const QR_LOOKUP_FAILED = 'Could not look up this QR code. Please try again.'

type DoorRegistration = {
  id: string
  user_id: string | null
  attendee_name: string
  attendee_email: string
  status: string | null
  ticket_types: { name: string | null } | null
}

export type DoorActor =
  | { kind: 'staff'; userId: string }
  // A volunteer's user_id is optional; the volunteer row id is what identifies them.
  | { kind: 'volunteer'; userId: string | null; volunteerId: string; email: string | null }

export async function recordDoorQrCheckIn(
  db: SupabaseClient,
  actor: DoorActor,
  eventId: string,
  qrCode: string,
  deviceId: string,
  offline?: OfflineWrite,
): Promise<CheckInResult> {
  const { data: regRow, error: regErr } = await db
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode.toLowerCase())
    .single()

  // PGRST116 is "no row". Any other error is a failed lookup, not an unknown
  // code: the offline sync retries it, the online scan asks to scan again
  // rather than telling the door the ticket does not exist.
  if (regErr && regErr.code !== 'PGRST116') {
    if (offline) throw new Error(regErr.message)
    console.error('[checkin] door registration lookup failed:', regErr.message)
    return { success: false, error: QR_LOOKUP_FAILED }
  }
  if (!regRow) return { success: false, error: QR_NOT_FOUND_FOR_EVENT }
  const reg = regRow as unknown as DoorRegistration
  // R90: the door admits confirmed registrations only; a refusal writes nothing.
  const refusal = doorRefusal(reg.status, reg.attendee_name)
  if (refusal) return { success: false, error: doorRefusalMessage(refusal), refusal }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', reg.id)
    .is('session_id', null)
    .limit(1)
    .maybeSingle()

  const summary = (alreadyCheckedIn: boolean, checkInTime?: string): NonNullable<CheckInResult['registration']> => ({
    id: reg.id,
    attendee_name: reg.attendee_name,
    attendee_email: reg.attendee_email,
    ticket_name: reg.ticket_types?.name ?? '',
    already_checked_in: alreadyCheckedIn,
    ...(alreadyCheckedIn ? { check_in_time: checkInTime } : {}),
  })
  const alreadyCheckedIn = (checkInTime?: string): CheckInResult => ({ success: true, registration: summary(true, checkInTime) })

  if (existing) return alreadyCheckedIn((existing as { checked_in_at: string }).checked_in_at)

  const { error: ciErr } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: reg.id,
    checked_in_by: actor.userId,
    method: 'qr_scan',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
    ...(offline ? {
      checked_in_at: offline.checkedInAt,
      checked_in_source: 'dashboard',
      is_offline: true,
      client_scanned_at: offline.clientScannedAt,
      client_entry_id: offline.clientEntryId,
    } : {}),
    // Last, so no other field can relabel a volunteer's check-in. Staff online
    // scans keep the column default ('dashboard'), as before.
    ...(actor.kind === 'volunteer' ? { checked_in_source: 'volunteer', checked_in_by_email: actor.email } : {}),
  })

  if (ciErr) {
    // 23505: a replayed queue entry (client_entry_id), or another device got
    // this registration in first (check_ins_door_once) — already checked in.
    if (isUniqueViolation(ciErr)) {
      // Report the time the winning check-in actually happened.
      const { data: winner, error: winnerErr } = await db
        .from('check_ins')
        .select('checked_in_at')
        .eq('registration_id', reg.id)
        .is('session_id', null)
        .limit(1)
        .maybeSingle()
      if (winnerErr) console.error('[checkin] door re-read after 23505 failed:', winnerErr.message)
      return alreadyCheckedIn((winner as { checked_in_at?: string } | null)?.checked_in_at)
    }
    if (offline) throw new Error(ciErr.message)
    return { success: false, error: ciErr.message }
  }

  const meta: Record<string, unknown> = offline ? { method: 'qr_scan', offline: true } : { method: 'qr_scan' }
  if (actor.kind === 'volunteer') Object.assign(meta, { via: 'volunteer', volunteer_id: actor.volunteerId })
  await logAudit(db, null, actor.userId, 'checkin.scan', 'registrations', reg.id, meta, { eventId })

  let points_awarded = 0
  if (reg.user_id) {
    const { awardPoints } = await import('@/lib/engagement/points')
    try {
      points_awarded = await awardPoints(eventId, reg.user_id, 'checkin')
    } catch {}
  }

  return { success: true, registration: summary(false), points_awarded }
}
