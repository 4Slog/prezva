'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser, getUser } from '@/lib/auth/get-user'
import { assertPermission, hasPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { isSuperAdmin } from '@/lib/admin/gate'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import { parseScanToken, GHL_TICKET_NOT_REGISTERED } from '@/lib/checkin/scan-token'
import { getSessionIdentity } from '@/lib/auth/session-identity'
import { resolveOwnedRegistration } from '@/lib/auth/owned-registration'
import {
  mintOfflineGrant,
  verifyOfflineGrant,
  grantScanFloor,
  GRANT_EXPIRED_REASON,
  GRANT_PERMISSION_LOST_REASON,
} from '@/lib/checkin/offline-grant'
import { loadOfflinePackAttendees, type OfflineSessionPack } from '@/lib/checkin/offline-pack'
import {
  OfflineSyncBatchSchema,
  SessionSyncBatchSchema,
  SessionSyncEntrySchema,
  SESSION_NOT_FOUND_REASON,
  parseEntries,
  type SessionSyncEntry,
  type SessionSyncFailure,
  parseOfflineEntries,
  resolveScanTime,
  offlineResult,
  isUniqueViolation,
  type OfflineEntryResult,
  type OfflineSyncResponse,
} from '@/lib/checkin/offline-sync'

export interface CheckInResult {
  success: boolean
  registration?: {
    id: string
    attendee_name: string
    attendee_email: string
    ticket_name: string
    already_checked_in: boolean
    check_in_time?: string
  }
  error?: string
  points_awarded?: number
  // Set on a refused GHL ticket scan (R79): staff may record an override (R81).
  canOverride?: boolean
}

export interface CheckInStats {
  total_registered: number
  total_checked_in: number
  percent: number
  recent: RecentCheckIn[]
}

export interface RecentCheckIn {
  id: string
  attendee_name: string
  attendee_email: string
  ticket_name: string
  checked_in_at: string
  method: string
}

async function getEventOrg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
) {
  const { data: event } = await supabase
    .from('events').select('org_id, id').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')
  return event as { org_id: string; id: string }
}

async function assertOrgMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
) {
  const event = await getEventOrg(supabase, eventId)
  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', event.org_id).eq('user_id', userId).single()
  if (!member) throw new Error('Not authorised')
  return event
}

export async function checkInByQR(
  eventId: string,
  qrCode: string,
  deviceId = 'web',
): Promise<CheckInResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return { success: false, error: (e as Error).message } }

  const result = await recordDoorQrCheckIn(supabase, user.id, eventId, qrCode, deviceId)
  if (result.success && !result.registration?.already_checked_in) revalidatePath('/events')
  return result
}

// Offline marker for a queued check-in (R87). checked_in_source stays the
// surface; these columns say it came from a device queue.
export interface OfflineWrite {
  checkedInAt: string
  clientScannedAt: string | null
  clientEntryId: string
}

// Core door QR write, shared by the online scan and the offline sync (R84). Not
// exported: the caller has already authorised staffUserId for the event. The
// online scan passes no `offline` and writes exactly as before (checked_in_at
// is the database default, now). The offline sync passes the resolved scan time
// and the R87 columns, and throws on a database failure so the entry is
// retried, not refused.
async function recordDoorQrCheckIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffUserId: string,
  eventId: string,
  qrCode: string,
  deviceId: string,
  offline?: OfflineWrite,
): Promise<CheckInResult> {
  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode.toLowerCase())
    .single()

  if (offline && regErr && regErr.code !== 'PGRST116') throw new Error(regErr.message)
  if (regErr || !reg) return { success: false, error: 'QR code not found for this event' }
  if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
  if ((reg as any).status === 'refunded') return { success: false, error: 'Registration was refunded' }

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
    .is('session_id', null)
    .single()

  const alreadyCheckedIn = (checkInTime?: string): CheckInResult => ({
    success: true,
    registration: {
      id: (reg as any).id,
      attendee_name: (reg as any).attendee_name,
      attendee_email: (reg as any).attendee_email,
      ticket_name: (reg as any).ticket_types?.name ?? '',
      already_checked_in: true,
      check_in_time: checkInTime,
    },
  })

  if (existing) return alreadyCheckedIn((existing as any).checked_in_at)

  const { error: ciErr } = await supabase.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    checked_in_by: staffUserId,
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
  })

  if (ciErr) {
    // A replayed queue entry (client_entry_id) was already written.
    if (offline && isUniqueViolation(ciErr)) return alreadyCheckedIn()
    if (offline) throw new Error(ciErr.message)
    return { success: false, error: ciErr.message }
  }

  await logAudit(supabase, null, staffUserId, 'checkin.scan', 'registrations', (reg as any).id,
    offline ? { method: 'qr_scan', offline: true } : { method: 'qr_scan' }, { eventId })

  let points_awarded = 0
  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    try {
      points_awarded = await awardPoints(eventId, (reg as any).user_id, 'checkin')
    } catch {}
  }

  return {
    success: true,
    registration: {
      id: (reg as any).id,
      attendee_name: (reg as any).attendee_name,
      attendee_email: (reg as any).attendee_email,
      ticket_name: (reg as any).ticket_types?.name ?? '',
      already_checked_in: false,
    },
    points_awarded,
  }
}

export async function checkInBySearch(
  eventId: string,
  registrationId: string,
  deviceId = 'web',
): Promise<CheckInResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return { success: false, error: (e as Error).message } }

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .single()

  if (!reg) return { success: false, error: 'Attendee not found' }
  if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
  if ((reg as any).status === 'refunded') return { success: false, error: 'Registration was refunded' }

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', registrationId)
    .is('session_id', null)
    .single()

  if (existing) {
    return {
      success: true,
      registration: {
        id: (reg as any).id,
        attendee_name: (reg as any).attendee_name,
        attendee_email: (reg as any).attendee_email,
        ticket_name: (reg as any).ticket_types?.name ?? '',
        already_checked_in: true,
        check_in_time: (existing as any).checked_in_at,
      },
    }
  }

  const { error } = await supabase.from('check_ins').insert({
    event_id: eventId,
    registration_id: registrationId,
    checked_in_by: user.id,
    method: 'manual',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }

  await logAudit(supabase, null, user.id, 'checkin.scan', 'registrations', registrationId, { method: 'manual' }, { eventId })

  let points_awarded = 0
  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    try {
      points_awarded = await awardPoints(eventId, (reg as any).user_id, 'checkin')
    } catch {}
  }

  revalidatePath('/events')
  return {
    success: true,
    registration: {
      id: (reg as any).id,
      attendee_name: (reg as any).attendee_name,
      attendee_email: (reg as any).attendee_email,
      ticket_name: (reg as any).ticket_types?.name ?? '',
      already_checked_in: false,
    },
    points_awarded,
  }
}

export async function undoCheckIn(eventId: string, registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.undo') } catch (e) { return catchPermission(e) }

  const { error } = await supabase
    .from('check_ins')
    .delete()
    .eq('registration_id', registrationId)
    .eq('event_id', eventId)
    .is('session_id', null)

  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function getCheckInStats(eventId: string): Promise<CheckInStats> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const [confirmedResult, checkedResult, recentResult] = await Promise.all([
    supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'confirmed'),
    supabase
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('session_id', null),
    supabase
      .from('check_ins')
      .select('id, checked_in_at, method, registrations(attendee_name, attendee_email, ticket_types(name))')
      .eq('event_id', eventId)
      .is('session_id', null)
      .order('checked_in_at', { ascending: false })
      .limit(20),
  ])

  const total = confirmedResult.count ?? 0
  const checked = checkedResult.count ?? 0

  const recent: RecentCheckIn[] = ((recentResult.data ?? []) as any[]).map(c => ({
    id: c.id,
    attendee_name: c.registrations?.attendee_name ?? '',
    attendee_email: c.registrations?.attendee_email ?? '',
    ticket_name: c.registrations?.ticket_types?.name ?? '',
    checked_in_at: c.checked_in_at,
    method: c.method,
  }))

  return {
    total_registered: total,
    total_checked_in: checked,
    percent: total > 0 ? Math.round((checked / total) * 100) : 0,
    recent,
  }
}

export async function processOfflineQueue(raw: unknown): Promise<OfflineSyncResponse | { error: string }> {
  const user = await requireUser()
  const parsed = OfflineSyncBatchSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { eventId, deviceId, deviceNow } = parsed.data
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return catchPermission(e) }

  const { valid, invalid } = parseOfflineEntries(parsed.data.entries)
  const results: OfflineEntryResult[] = [...invalid]
  // Sequential: two queued scans of one code must not race past the
  // existing-check-in lookup.
  for (const entry of valid) {
    const time = resolveScanTime(entry.scanned_at, { deviceNow })
    if (!time.ok) {
      results.push({ entryId: entry.entryId, status: 'refused', reason: time.reason })
      continue
    }
    try {
      const r = await recordDoorQrCheckIn(supabase, user.id, eventId, entry.qr_code, deviceId, {
        checkedInAt: time.checkedInAt,
        clientScannedAt: time.clientScannedAt,
        clientEntryId: entry.entryId,
      })
      results.push(offlineResult(entry.entryId, r, time.clamped))
    } catch (e) {
      console.error('[checkin] offline entry failed, device will retry:', e)
      results.push({ entryId: entry.entryId, status: 'retry', reason: 'Server error' })
    }
  }

  const processed = results.filter(r => r.status === 'accepted').length
  if (processed > 0) revalidatePath('/events')
  return { processed, total: parsed.data.entries.length, results }
}

type SessionCheckInMethod = 'self' | 'qr_scan' | 'manual' | 'override'

// A dashboard session check-in written from a device queue (M3b): the R87
// columns plus the device id.
type SessionOfflineWrite = OfflineWrite & { deviceId: string }

// Core session write. Not exported: checkedInBy is a staff identity and 'override'
// is a staff-only record (R81), so only server code that has already authorised
// the caller may supply them. Online callers pass no `offline` and write exactly
// as before. The offline sync passes the resolved scan time and R87 columns; a
// unique violation (the registration+session key, or a replayed client_entry_id)
// is already_checked_in, and any other database failure throws so the device
// retries the entry.
async function recordSessionCheckIn(
  registrationId: string,
  sessionId: string,
  method: SessionCheckInMethod,
  checkedInBy: string | null,
  offline?: SessionOfflineWrite,
): Promise<{ ok: boolean; alreadyCheckedIn?: boolean; error?: string }> {
  const supabase = createAdminClient()

  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .select('id, event_id, status, events(org_id)')
    .eq('id', registrationId)
    .maybeSingle()

  if (offline && regErr) throw new Error(regErr.message)

  if (!reg) return { ok: false, error: 'Registration not found' }
  if (reg.status !== 'confirmed') {
    return { ok: false, error: 'Registration is not confirmed' }
  }

  const { data: session, error: sessionErr } = await supabase
    .from('sessions')
    .select('id, event_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (offline && sessionErr) throw new Error(sessionErr.message)
  if (!session || session.event_id !== reg.event_id) {
    return { ok: false, error: 'Session not found for this event' }
  }

  const { data: existing, error: existingErr } = await supabase
    .from('check_ins')
    .select('id')
    .eq('registration_id', registrationId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (offline && existingErr) throw new Error(existingErr.message)
  if (existing) return { ok: true, alreadyCheckedIn: true }

  const { error } = await supabase.from('check_ins').insert({
    registration_id: registrationId,
    event_id: reg.event_id,
    session_id: sessionId,
    method,
    checked_in_by: checkedInBy,
    checked_in_at: offline ? offline.checkedInAt : new Date().toISOString(),
    synced_at: new Date().toISOString(),
    ...(offline ? {
      checked_in_source: 'dashboard',
      is_offline: true,
      client_scanned_at: offline.clientScannedAt,
      client_entry_id: offline.clientEntryId,
      device_id: offline.deviceId,
    } : {}),
  })

  if (error) {
    if (offline && isUniqueViolation(error)) return { ok: true, alreadyCheckedIn: true }
    if (offline) throw new Error(error.message)
    return { ok: false, error: error.message }
  }

  try {
    const orgId = (reg.events as any)?.org_id as string | undefined
    const locationId = orgId ? await ghlLocationIdForOrg(supabase, orgId) : null
    if (locationId) {
      const config = await getGhlOrgConfig(supabase, orgId as string)
      if (config) {
        await enqueueGhlStageMove({ registrationId, stageId: config.stageIds.attendedSession })
      } else {
        console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      }
    }
  } catch (e) {
    console.error('[checkin] enqueueGhlStageMove failed:', e)
  }

  return { ok: true, alreadyCheckedIn: false }
}

export async function checkInToSession(
  eventSlug: string,
  sessionId: string,
): Promise<{ ok: boolean; alreadyCheckedIn?: boolean; error?: string }> {
  // Attendee self check-in from the agenda (O102). Callable from the client, so it
  // takes no registration id and no method: the registration is the one the caller
  // is proven to own, and the row is always 'self' with no staff identity.
  if (typeof eventSlug !== 'string' || !eventSlug || typeof sessionId !== 'string' || !sessionId) {
    return { ok: false, error: 'Invalid check-in' }
  }

  const { data: event } = await createAdminClient()
    .from('events')
    .select('id')
    .eq('slug', eventSlug)
    .maybeSingle()
  if (!event) return { ok: false, error: 'Event not found' }

  const identity = await getSessionIdentity(eventSlug)
  const owned = await resolveOwnedRegistration(identity, event.id)
  if (!owned) return { ok: false, error: 'Sign in to check in' }

  return recordSessionCheckIn(owned.id, sessionId, 'self', null)
}

type SessionRegRow = {
  id: string
  attendee_name: string
  attendee_email: string
  status: string
  ticket_types: { name: string } | null
}

const SESSION_REG_SELECT = 'id, attendee_name, attendee_email, status, ticket_types(name)'

async function finishStaffSessionCheckIn(
  reg: SessionRegRow,
  sessionId: string,
  method: 'qr_scan' | 'manual' | 'override',
  staffUserId: string,
  offline?: SessionOfflineWrite,
): Promise<CheckInResult> {
  if (reg.status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
  if (reg.status === 'refunded') return { success: false, error: 'Registration was refunded' }
  const result = await recordSessionCheckIn(reg.id, sessionId, method, staffUserId, offline)
  if (!result.ok) return { success: false, error: result.error }
  return {
    success: true,
    registration: {
      id: reg.id,
      attendee_name: reg.attendee_name,
      attendee_email: reg.attendee_email,
      ticket_name: reg.ticket_types?.name ?? '',
      already_checked_in: !!result.alreadyCheckedIn,
    },
  }
}

// ── Org-authed session check-in (wraps the admin session write with auth guard) ─
export async function orgCheckInToSession(
  eventId: string,
  sessionId: string,
  qrCodeOrRegId: string,
  method: 'qr_scan' | 'manual',
): Promise<CheckInResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return { success: false, error: (e as Error).message } }

  if (method === 'qr_scan') {
    const found = await lookupSessionScanReg(supabase, eventId, qrCodeOrRegId)
    if ('error' in found) return { success: false, ...found }
    return finishStaffSessionCheckIn(found.reg, sessionId, method, user.id)
  }

  const { data: reg } = await supabase
    .from('registrations')
    .select(SESSION_REG_SELECT)
    .eq('id', qrCodeOrRegId)
    .eq('event_id', eventId)
    .single()
  if (!reg) return { success: false, error: 'Attendee not found' }
  return finishStaffSessionCheckIn(reg as unknown as SessionRegRow, sessionId, method, user.id)
}

// The session scan lookup, shared by the online scan and the offline sync so a
// queued token is judged exactly as a live one. `strict` (offline) throws on a
// database failure so the entry is retried instead of refused.
async function lookupSessionScanReg(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  raw: string,
  strict = false,
): Promise<{ reg: SessionRegRow } | { error: string; canOverride?: boolean }> {
  const token = parseScanToken(raw)
  if (token.kind === 'ghl') {
    // R79: event-scoped. A token registered on another event is indistinguishable
    // from an unknown one here — never reveal which event it belongs to.
    const { data: reg, error } = await supabase
      .from('registrations')
      .select(SESSION_REG_SELECT)
      .eq('event_id', eventId)
      .eq('ghl_attendee_id', token.attendeeId)
      .maybeSingle()
    if (strict && error) throw new Error(error.message)
    if (!reg) return { error: GHL_TICKET_NOT_REGISTERED, canOverride: true }
    return { reg: reg as unknown as SessionRegRow }
  }
  // A2: Prezva's own QR — and anything unrecognised — takes the qr_code lookup
  // exactly as before (manual-add and transfer codes are not 32-hex).
  const qrCode = token.kind === 'prezva' ? token.qrCode : raw.toLowerCase()
  const { data: reg, error } = await supabase
    .from('registrations')
    .select(SESSION_REG_SELECT)
    .eq('event_id', eventId)
    .eq('qr_code', qrCode)
    .single()
  if (strict && error && error.code !== 'PGRST116') throw new Error(error.message)
  if (!reg) return { error: 'QR code not found for this event' }
  return { reg: reg as unknown as SessionRegRow }
}

// R81: staff check-in after a refused scan. Recorded as method 'override' with the
// staff member stored, so it is distinguishable from a scan or a plain Mark in.
export async function orgOverrideSessionCheckIn(
  eventId: string,
  sessionId: string,
  registrationId: string,
): Promise<CheckInResult> {
  const user = await requireUser()
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return { success: false, error: (e as Error).message } }

  const { data: reg } = await supabase
    .from('registrations')
    .select(SESSION_REG_SELECT)
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!reg) return { success: false, error: 'Attendee not found' }
  return finishStaffSessionCheckIn(reg as unknown as SessionRegRow, sessionId, 'override', user.id)
}

// ── Offline session scanning (M3b) ───────────────────────────────────────────

// The list an offline session scanner holds, plus the staff grant its queued
// check-ins will sync under. Stricter than the online list: checkin.manage, not
// just membership.
export async function getOfflineSessionPack(
  eventId: string,
  sessionId: string,
): Promise<OfflineSessionPack | { error: string }> {
  // Refreshed in the background every few minutes: a signed-out user gets an
  // error (the device keeps its stored list), never a redirect off the scanner.
  const user = await getUser()
  if (!user) return { error: 'Signed out' }
  const db = createAdminClient()
  const { data: event } = await db
    .from('events').select('id, org_id, end_at').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Event not found' }
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return { error: (e as Error).message } }

  const { data: session } = await db
    .from('sessions').select('id').eq('id', sessionId).eq('event_id', eventId).maybeSingle()
  if (!session) return { error: SESSION_NOT_FOUND_REASON }

  try {
    const now = new Date()
    const attendees = await loadOfflinePackAttendees(db, eventId, sessionId)
    const grant = await mintOfflineGrant(
      { surface: 'dashboard', eventId, sessionId, orgId: event.org_id, userId: user.id, email: null },
      event.end_at,
      now,
    )
    return { serverNow: now.toISOString(), grant, eventEndsAt: event.end_at, attendees }
  } catch (e) {
    console.error('[checkin] offline pack failed:', e)
    return { error: 'Could not load the offline list' }
  }
}

// Drains a device's queued session check-ins. Live auth is the signed-in user
// (checkin.manage); the IDENTITY written is the grant's, re-checked here. URL
// ids (the arguments) win over anything in the body.
export async function processOfflineSessionQueue(
  eventId: string,
  sessionId: string,
  raw: unknown,
): Promise<OfflineSyncResponse | SessionSyncFailure> {
  const user = await getUser()
  if (!user) return { error: 'Session expired; reopen the page', code: 'session_expired', status: 401 }

  const parsed = SessionSyncBatchSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, status: 400 }
  const { deviceId, deviceNow } = parsed.data

  const supabase = await createClient()
  const { data: event } = await supabase
    .from('events').select('id, org_id').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Event not found', status: 400 }
  if (!(await hasPermission(event.org_id, user.id, 'checkin.manage'))) {
    return { error: 'Not authorised to check in attendees', status: 403 }
  }

  const { valid, invalid } = parseEntries(parsed.data.entries, SessionSyncEntrySchema)
  const results: OfflineEntryResult[] = [...invalid]
  const refuseAll = (reason: string): OfflineSyncResponse => {
    for (const e of valid) results.push({ entryId: e.entryId, status: 'refused', reason, kind: e.kind })
    return { processed: 0, total: parsed.data.entries.length, results }
  }
  const retryAll = (): OfflineSyncResponse => {
    for (const e of valid) results.push({ entryId: e.entryId, status: 'retry', reason: 'Server error', kind: e.kind })
    return { processed: 0, total: parsed.data.entries.length, results }
  }

  const { data: session } = await supabase
    .from('sessions').select('id').eq('id', sessionId).eq('event_id', eventId).maybeSingle()
  if (!session) return refuseAll(SESSION_NOT_FOUND_REASON)

  const grant = await verifyOfflineGrant(parsed.data.grant, { surface: 'dashboard', eventId, sessionId })
  if (!grant || grant.orgId !== event.org_id || !grant.userId) return refuseAll(GRANT_EXPIRED_REASON)
  const staffUserId = grant.userId
  // Only a definite denial refuses; a lookup failure leaves the entries to retry.
  const still = await grantHolderCanCheckIn(event.org_id, staffUserId)
  if (still === 'error') return retryAll()
  if (still === 'denied') return refuseAll(GRANT_PERMISSION_LOST_REASON)

  const floor = grantScanFloor(grant)
  // Sequential: two queued scans of one attendee must not race.
  for (const entry of valid) {
    const time = resolveScanTime(entry.scannedAt, { deviceNow, floor })
    if (!time.ok) {
      results.push({ entryId: entry.entryId, status: 'refused', reason: time.reason, kind: entry.kind })
      continue
    }
    const offline: SessionOfflineWrite = {
      checkedInAt: time.checkedInAt,
      clientScannedAt: time.clientScannedAt,
      clientEntryId: entry.entryId,
      deviceId,
    }
    try {
      const { method, r } = await syncSessionEntry(supabase, eventId, sessionId, entry, staffUserId, offline)
      const result: OfflineEntryResult = { ...offlineResult(entry.entryId, r, time.clamped), kind: entry.kind }
      results.push(result)
      if (result.status === 'accepted' && r.registration) {
        await logAudit(null, null, staffUserId, 'checkin.scan', 'registrations', r.registration.id,
          { method, offline: true, kind: entry.kind }, { eventId })
      }
    } catch (e) {
      console.error('[checkin] offline session entry failed, device will retry:', e)
      results.push({ entryId: entry.entryId, status: 'retry', reason: 'Server error', kind: entry.kind })
    }
  }

  return { processed: results.filter(r => r.status === 'accepted').length, total: parsed.data.entries.length, results }
}

// checkin.manage for the grant's user, with the same rules as assertPermission
// but reading the errors it folds into a denial: 'error' means "could not tell"
// (the sync retries), never "no access".
async function grantHolderCanCheckIn(orgId: string, userId: string): Promise<'allowed' | 'denied' | 'error'> {
  try {
    if (isSuperAdmin(userId)) return 'allowed'
    const db = createAdminClient()
    const { data: member, error } = await db
      .from('org_members').select('role_id').eq('org_id', orgId).eq('user_id', userId).maybeSingle()
    if (error) return 'error'
    if (!member?.role_id) return 'denied'
    const { data: perm, error: permErr } = await db
      .from('role_permissions').select('permission_key')
      .eq('role_id', member.role_id).eq('permission_key', 'checkin.manage').maybeSingle()
    if (permErr) return 'error'
    return perm ? 'allowed' : 'denied'
  } catch (e) {
    console.error('[checkin] grant permission check failed:', e)
    return 'error'
  }
}

async function syncSessionEntry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  sessionId: string,
  entry: SessionSyncEntry,
  staffUserId: string,
  offline: SessionOfflineWrite,
): Promise<{ method: 'qr_scan' | 'manual' | 'override'; r: CheckInResult }> {
  if (entry.kind === 'scan' || entry.kind === 'recheck') {
    // R85: a recheck is judged exactly like a live scan (R79 + R80).
    const found = await lookupSessionScanReg(supabase, eventId, entry.token, true)
    if ('error' in found) return { method: 'qr_scan', r: { success: false, error: found.error } }
    return { method: 'qr_scan', r: await finishStaffSessionCheckIn(found.reg, sessionId, 'qr_scan', staffUserId, offline) }
  }
  const method = entry.kind
  const { data: reg, error } = await supabase
    .from('registrations')
    .select(SESSION_REG_SELECT)
    .eq('id', entry.registrationId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!reg) return { method, r: { success: false, error: 'Attendee not found' } }
  return { method, r: await finishStaffSessionCheckIn(reg as unknown as SessionRegRow, sessionId, method, staffUserId, offline) }
}

export interface SessionAttendeeRow {
  registration_id: string
  attendee_name: string
  attendee_email: string
  ticket_name: string
  checked_in: boolean
  checked_in_at?: string
}

export async function getSessionCheckInAttendees(
  eventId: string,
  sessionId: string,
): Promise<SessionAttendeeRow[]> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const { data } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, ticket_types(name), check_ins!left(id, checked_in_at, session_id)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .order('attendee_name')

  return ((data ?? []) as any[]).map(r => {
    const sessionCheckIn = (r.check_ins ?? []).find((c: any) => c.session_id === sessionId)
    return {
      registration_id: r.id,
      attendee_name: r.attendee_name,
      attendee_email: r.attendee_email,
      ticket_name: r.ticket_types?.name ?? '',
      checked_in: !!sessionCheckIn,
      checked_in_at: sessionCheckIn?.checked_in_at,
    }
  })
}

export async function searchAttendeesForCheckIn(eventId: string, query: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  if (!query || query.length < 2) return []

  const { data } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, delivery_method, ticket_types(name), check_ins(id, checked_in_at)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .or('attendee_name.ilike.%' + query + '%,attendee_email.ilike.%' + query + '%')
    .limit(10)

  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    attendee_name: r.attendee_name,
    attendee_email: r.attendee_email,
    ticket_name: r.ticket_types?.name ?? '',
    delivery_method: r.delivery_method ?? 'in_person',
    checked_in: (r.check_ins?.length ?? 0) > 0,
    check_in_time: r.check_ins?.[0]?.checked_in_at ?? null,
  }))
}
