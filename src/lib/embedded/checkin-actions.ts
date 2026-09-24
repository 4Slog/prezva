'use server'

import { ilikeAnyOf } from '@/lib/db/postgrest-filter'
import { doorRefusal, doorRefusalMessage, sessionStatusError } from '@/lib/checkin/admission'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME, type EmbeddedSessionPayload } from '@/lib/embedded/session'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { logAudit } from '@/lib/audit/log'
import { getGhlOrgConfig, type GhlStageKey } from '@/lib/integrations/ghl/org-config'
import { parseScanToken, GHL_TICKET_NOT_REGISTERED } from '@/lib/checkin/scan-token'
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

export type { CheckInResult, CheckInStats, RecentCheckIn, SessionAttendeeRow } from '@/lib/checkin/actions'

import type { CheckInResult, CheckInStats, RecentCheckIn, SessionAttendeeRow, OfflineWrite } from '@/lib/checkin/actions'

// ── Embed context ─────────────────────────────────────────────────────────────

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
  return embedContextFor(session)
}

// The embed session from the cookie, or null when it is missing, expired or
// invalid (the offline sync answers 401 session_expired instead of throwing).
async function readEmbedSession(): Promise<EmbeddedSessionPayload | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    return await verifyEmbeddedSession(token)
  } catch {
    return null
  }
}

async function embedContextFor(session: EmbeddedSessionPayload) {
  const db = createAdminClient()
  const { data: link } = await db
    .from('ghl_location_links')
    .select('org_id')
    .eq('ghl_location_id', session.location_id)
    .maybeSingle()
  if (!link) throw new Error('Location not linked to any organization')
  const staffEmail = session.user_email?.trim().toLowerCase() || null
  return { db, orgId: link.org_id, staffEmail }
}

// R81: who did an embedded session check-in. The embed session carries no Prezva
// user id, only the GHL user's email (signed SSO payload, or the authenticated
// Prezva email on the claim path). The email is always recorded; when it belongs
// to a Prezva profile that is a member of the event's org, that profile id is
// recorded too. A missing email or a failed lookup never blocks a check-in.
async function resolveEmbedStaff(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  staffEmail: string | null,
): Promise<{ checked_in_by: string | null; checked_in_by_email: string | null }> {
  try {
    return await resolveEmbedStaffStrict(db, orgId, staffEmail)
  } catch (e) {
    console.error('[embed-checkin] staff lookup failed (email still recorded):', e)
    return { checked_in_by: null, checked_in_by_email: staffEmail }
  }
}

// resolveEmbedStaff without the fallback: a failed lookup THROWS instead of
// reading as "not a member". The offline sync's identity re-check needs to tell
// the two apart (a failure retries; only a definite answer refuses).
async function resolveEmbedStaffStrict(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  staffEmail: string | null,
): Promise<{ checked_in_by: string | null; checked_in_by_email: string | null }> {
  if (!staffEmail) return { checked_in_by: null, checked_in_by_email: null }
  // ilike for case-insensitivity; the exact compare below neutralises any
  // wildcard PostgREST still honours (it rewrites '*' to '%').
  const pattern = staffEmail.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const { data: profiles, error: profilesErr } = await db
    .from('profiles')
    .select('id, email')
    .ilike('email', pattern)
    .limit(20)
  if (profilesErr) throw new Error(profilesErr.message)
  const ids = (profiles ?? [])
    .filter(p => p.email?.trim().toLowerCase() === staffEmail)
    .map(p => p.id)
  if (ids.length === 0) return { checked_in_by: null, checked_in_by_email: staffEmail }
  const { data: members, error: membersErr } = await db
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id', ids)
  if (membersErr) throw new Error(membersErr.message)
  const memberIds = [...new Set((members ?? []).map(m => m.user_id))]
  // Two member profiles sharing one email is ambiguous — record the email only.
  return { checked_in_by: memberIds.length === 1 ? memberIds[0] : null, checked_in_by_email: staffEmail }
}

async function assertEventOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  orgId: string,
) {
  const { data } = await db
    .from('events')
    .select('id, org_id')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!data) throw new Error('Event not found or access denied')
  return data
}

// ── Check-in helpers ──────────────────────────────────────────────────────────

async function fireGhlStageMove(
  db: ReturnType<typeof createAdminClient>,
  registrationId: string,
  orgId: string,
  stageKey: GhlStageKey = 'checkedIn',
) {
  try {
    // Every caller resolves orgId via resolveEmbedContext's ghl_location_links
    // lookup (or receives it already resolved) — GHL-linkage is implied, so a
    // null config here is always the "linked but unprovisioned" case.
    const config = await getGhlOrgConfig(db, orgId)
    if (!config) {
      console.error(`[ghl] org ${orgId} is GHL-linked but has no ghl_org_config row — sync skipped`)
      return
    }
    await enqueueGhlStageMove({ registrationId, stageId: config.stageIds[stageKey] })
  } catch (e) {
    // Never let GHL sync failure block a check-in
    console.error('[embed-checkin] enqueueGhlStageMove failed:', e)
  }
}

// ── Server Actions ────────────────────────────────────────────────────────────

// A door result for a registration that is already in (no time known).
function embedAlreadyCheckedIn(reg: unknown): CheckInResult {
  const r = reg as { id: string; attendee_name: string; attendee_email: string; ticket_types?: { name?: string } | null }
  return {
    success: true,
    registration: {
      id: r.id,
      attendee_name: r.attendee_name,
      attendee_email: r.attendee_email,
      ticket_name: r.ticket_types?.name ?? '',
      already_checked_in: true,
    },
  }
}

export async function checkInByQR(
  eventId: string,
  qrCode: string,
  deviceId = 'embed',
): Promise<CheckInResult> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: reg, error: regErr } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode.toLowerCase())
    .single()

  if (regErr || !reg) return { success: false, error: 'QR code not found for this event' }
  // R90: the door admits confirmed registrations only; a refusal writes nothing.
  const refusal = doorRefusal((reg as any).status, (reg as any).attendee_name)
  if (refusal) return { success: false, error: doorRefusalMessage(refusal), refusal }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
    .is('session_id', null)
    .limit(1)
    .maybeSingle()

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

  const { error: ciErr } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    checked_in_by: null,
    checked_in_source: 'embed',
    method: 'qr_scan',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  // 23505 (check_ins_door_once): another scan got this registration in first.
  if (isUniqueViolation(ciErr)) return embedAlreadyCheckedIn(reg)
  if (ciErr) return { success: false, error: ciErr.message }

  await fireGhlStageMove(db, (reg as any).id, orgId)

  return {
    success: true,
    registration: {
      id: (reg as any).id,
      attendee_name: (reg as any).attendee_name,
      attendee_email: (reg as any).attendee_email,
      ticket_name: (reg as any).ticket_types?.name ?? '',
      already_checked_in: false,
    },
  }
}

export async function checkInBySearch(
  eventId: string,
  registrationId: string,
  deviceId = 'embed',
): Promise<CheckInResult> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: reg } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .single()

  if (!reg) return { success: false, error: 'Attendee not found' }
  // R90: the door admits confirmed registrations only; a refusal writes nothing.
  const refusal = doorRefusal((reg as any).status, (reg as any).attendee_name)
  if (refusal) return { success: false, error: doorRefusalMessage(refusal), refusal }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', registrationId)
    .is('session_id', null)
    .limit(1)
    .maybeSingle()

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

  const { error } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: registrationId,
    checked_in_by: null,
    checked_in_source: 'embed',
    method: 'manual',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  if (isUniqueViolation(error)) return embedAlreadyCheckedIn(reg)
  if (error) return { success: false, error: error.message }

  await fireGhlStageMove(db, registrationId, orgId)

  return {
    success: true,
    registration: {
      id: (reg as any).id,
      attendee_name: (reg as any).attendee_name,
      attendee_email: (reg as any).attendee_email,
      ticket_name: (reg as any).ticket_types?.name ?? '',
      already_checked_in: false,
    },
  }
}

export async function undoCheckIn(eventId: string, registrationId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('check_ins')
    .delete()
    .eq('registration_id', registrationId)
    .eq('event_id', eventId)
    .is('session_id', null)

  if (error) return { error: error.message }
  return { success: true }
}

export async function getCheckInStats(eventId: string): Promise<CheckInStats> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [confirmedResult, checkedResult, recentResult] = await Promise.all([
    db
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('status', 'confirmed'),
    db
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('session_id', null),
    db
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
  const parsed = OfflineSyncBatchSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { eventId, deviceId, deviceNow } = parsed.data
  // Verify embed context before processing
  const { db, orgId, staffEmail } = await resolveEmbedContext()
  const { data: eventRow } = await db.from('events').select('id').eq('id', eventId).eq('org_id', orgId).maybeSingle()
  if (!eventRow) return { error: 'Event not found or access denied' }

  // R84: the staff member recorded is the one SYNCING the queue (the embed
  // session making this request), not necessarily the one who scanned.
  const staff = await resolveEmbedStaff(db, orgId, staffEmail)

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
      const r = await checkInByQRInternal(db, orgId, eventId, entry.qr_code.toLowerCase(), deviceId, staff, {
        checkedInAt: time.checkedInAt,
        clientScannedAt: time.clientScannedAt,
        clientEntryId: entry.entryId,
      })
      results.push(offlineResult(entry.entryId, r, time.clamped))
    } catch (e) {
      console.error('[embed-checkin] offline entry failed, device will retry:', e)
      results.push({ entryId: entry.entryId, status: 'retry', reason: 'Server error' })
    }
  }

  const processed = results.filter(r => r.status === 'accepted').length
  return { processed, total: parsed.data.entries.length, results }
}

// Offline-sync door write for processOfflineQueue (avoids re-resolving embed
// context per entry). A database failure throws so the device retries the entry
// instead of moving it to needs_attention.
async function checkInByQRInternal(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  eventId: string,
  qrCode: string,
  deviceId: string,
  staff: { checked_in_by: string | null; checked_in_by_email: string | null },
  offline: OfflineWrite,
): Promise<CheckInResult> {
  const { data: reg, error: regErr } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode)
    .single()

  if (regErr && regErr.code !== 'PGRST116') throw new Error(regErr.message)
  if (regErr || !reg) return { success: false, error: 'QR code not found for this event' }
  // R90: the door admits confirmed registrations only; a refusal writes nothing.
  const refusal = doorRefusal((reg as any).status, (reg as any).attendee_name)
  if (refusal) return { success: false, error: doorRefusalMessage(refusal), refusal }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
    .is('session_id', null)
    .limit(1)
    .maybeSingle()

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

  const { error: ciErr } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    ...staff,
    // R87: the surface; the offline marker is its own columns.
    checked_in_source: 'embed',
    is_offline: true,
    client_scanned_at: offline.clientScannedAt,
    client_entry_id: offline.clientEntryId,
    method: 'qr_scan',
    device_id: deviceId,
    checked_in_at: offline.checkedInAt,
    synced_at: new Date().toISOString(),
  })

  // A replayed queue entry (client_entry_id) was already written.
  if (isUniqueViolation(ciErr)) return alreadyCheckedIn()
  if (ciErr) throw new Error(ciErr.message)

  await fireGhlStageMove(db, (reg as any).id, orgId)

  return {
    success: true,
    registration: {
      id: (reg as any).id,
      attendee_name: (reg as any).attendee_name,
      attendee_email: (reg as any).attendee_email,
      ticket_name: (reg as any).ticket_types?.name ?? '',
      already_checked_in: false,
    },
  }
}

export async function searchAttendeesForCheckIn(eventId: string, query: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  if (!query || query.length < 2) return []

  const { data } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, delivery_method, ticket_types(name), check_ins(id, checked_in_at)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .or(ilikeAnyOf(['attendee_name', 'attendee_email'], query))
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

// ── Session-scope helpers ─────────────────────────────────────────────────────

async function assertSessionOwnership(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  sessionId: string,
) {
  const { data } = await db
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!data) throw new Error('Session not found or access denied')
}

// ── Session check-in actions ──────────────────────────────────────────────────

type SessionScanReg = {
  id: string
  attendee_name: string
  attendee_email: string
  status: string
  ticket_types: { name: string } | null
}


export async function embedScanIntoSession(
  eventId: string,
  sessionId: string,
  qrCode: string,
  deviceId = 'embed',
): Promise<CheckInResult> {
  const { db, orgId, staffEmail } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  await assertSessionOwnership(db, eventId, sessionId)

  const found = await embedLookupScanReg(db, eventId, qrCode)
  if ('error' in found) return { success: false, ...found }
  return embedWriteSessionCheckIn(db, orgId, eventId, sessionId, found.reg, 'qr_scan', deviceId,
    () => resolveEmbedStaff(db, orgId, staffEmail))
}

// The session scan lookup, shared by the online scan and the offline sync so a
// queued token is judged exactly as a live one. `strict` (offline) throws on a
// database failure so the entry is retried instead of refused.
async function embedLookupScanReg(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
  raw: string,
  strict = false,
): Promise<{ reg: SessionScanReg } | { error: string; canOverride?: boolean }> {
  const token = parseScanToken(raw)
  if (token.kind === 'ghl') {
    // R79: event-scoped. A token registered on another event is indistinguishable
    // from an unknown one here — never reveal which event it belongs to.
    const { data, error } = await db
      .from('registrations')
      .select('id, attendee_name, attendee_email, status, ticket_types(name)')
      .eq('event_id', eventId)
      .eq('ghl_attendee_id', token.attendeeId)
      .maybeSingle()
    if (strict && error) throw new Error(error.message)
    if (!data) return { error: GHL_TICKET_NOT_REGISTERED, canOverride: true }
    return { reg: data as unknown as SessionScanReg }
  }
  // A2: Prezva's own QR — and anything unrecognised — takes the qr_code lookup
  // exactly as before (manual-add and transfer codes are not 32-hex).
  const { data, error } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', token.kind === 'prezva' ? token.qrCode : raw.toLowerCase())
    .single()
  if (strict && error && error.code !== 'PGRST116') throw new Error(error.message)
  if (error || !data) return { error: 'QR code not found for this event' }
  return { reg: data as unknown as SessionScanReg }
}

type EmbedStaff = { checked_in_by: string | null; checked_in_by_email: string | null }

// The one embedded session write: online scan, manual mark and override, and
// the offline sync. Online callers pass no `offline` and write exactly as
// before (staff resolved lazily, only when a row is written). The offline sync
// passes the grant's staff and the R87 columns; a unique violation (the
// registration+session key, or a replayed client_entry_id) is
// already_checked_in, and any other database failure throws so the device
// retries the entry.
async function embedWriteSessionCheckIn(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  eventId: string,
  sessionId: string,
  reg: SessionScanReg,
  method: 'qr_scan' | 'manual' | 'override',
  deviceId: string,
  staff: () => Promise<EmbedStaff>,
  offline?: OfflineWrite,
): Promise<CheckInResult> {
  const statusError = sessionStatusError(reg.status)
  if (statusError) return { success: false, error: statusError }

  const registration = {
    id: reg.id,
    attendee_name: reg.attendee_name,
    attendee_email: reg.attendee_email,
    ticket_name: reg.ticket_types?.name ?? '',
  }
  const alreadyCheckedIn = (checkInTime?: string | null): CheckInResult => ({
    success: true,
    registration: { ...registration, already_checked_in: true, check_in_time: checkInTime ?? undefined },
  })

  const { data: existing, error: existingErr } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', reg.id)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (offline && existingErr) throw new Error(existingErr.message)
  if (existing) return alreadyCheckedIn(existing.checked_in_at)

  const { error } = await db.from('check_ins').insert({
    event_id: eventId,
    session_id: sessionId,
    registration_id: reg.id,
    ...(await staff()),
    checked_in_source: 'embed',
    method,
    device_id: deviceId,
    synced_at: new Date().toISOString(),
    ...(offline ? {
      checked_in_at: offline.checkedInAt,
      is_offline: true,
      client_scanned_at: offline.clientScannedAt,
      client_entry_id: offline.clientEntryId,
    } : {}),
  })

  if (error) {
    if (offline && isUniqueViolation(error)) return alreadyCheckedIn()
    if (offline) throw new Error(error.message)
    return { success: false, error: error.message }
  }

  await fireGhlStageMove(db, reg.id, orgId, 'attendedSession')

  return { success: true, registration: { ...registration, already_checked_in: false } }
}

export async function embedManualMarkSession(
  eventId: string,
  sessionId: string,
  registrationId: string,
  deviceId = 'embed',
): Promise<CheckInResult> {
  return embedMarkSession(eventId, sessionId, registrationId, 'manual', deviceId)
}

// R81: staff check-in after a refused scan, recorded as method 'override' with the
// staff email (and member profile id when it resolves).
export async function embedOverrideSessionCheckIn(
  eventId: string,
  sessionId: string,
  registrationId: string,
  deviceId = 'embed',
): Promise<CheckInResult> {
  return embedMarkSession(eventId, sessionId, registrationId, 'override', deviceId)
}

async function embedMarkSession(
  eventId: string,
  sessionId: string,
  registrationId: string,
  method: 'manual' | 'override',
  deviceId: string,
): Promise<CheckInResult> {
  const { db, orgId, staffEmail } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  await assertSessionOwnership(db, eventId, sessionId)

  const { data } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .single()

  if (!data) return { success: false, error: 'Attendee not found' }
  return embedWriteSessionCheckIn(db, orgId, eventId, sessionId, data as unknown as SessionScanReg, method, deviceId,
    () => resolveEmbedStaff(db, orgId, staffEmail))
}

// ── Offline session scanning (M3b) ───────────────────────────────────────────

// The list an offline session scanner holds, plus the staff grant its queued
// check-ins will sync under (who the embed session says the staff member is).
export async function embedGetOfflineSessionPack(
  eventId: string,
  sessionId: string,
): Promise<OfflineSessionPack | { error: string }> {
  try {
    const { db, orgId, staffEmail } = await resolveEmbedContext()
    const { data: event } = await db
      .from('events').select('id, end_at').eq('id', eventId).eq('org_id', orgId).maybeSingle()
    if (!event) return { error: 'Event not found or access denied' }
    await assertSessionOwnership(db, eventId, sessionId)

    const now = new Date()
    const staff = await resolveEmbedStaff(db, orgId, staffEmail)
    const attendees = await loadOfflinePackAttendees(db, eventId, sessionId)
    const grant = await mintOfflineGrant(
      { surface: 'embed', eventId, sessionId, orgId, userId: staff.checked_in_by, email: staffEmail },
      event.end_at,
      now,
    )
    return { serverNow: now.toISOString(), grant, eventEndsAt: event.end_at, attendees }
  } catch (e) {
    console.error('[embed-checkin] offline pack failed:', e)
    return { error: e instanceof Error ? e.message : 'Could not load the offline list' }
  }
}

// Drains a device's queued session check-ins. Live auth is the embed session
// (event + session ownership); the IDENTITY written is the grant's. URL ids
// (the arguments) win over anything in the body.
export async function embedProcessOfflineSessionQueue(
  eventId: string,
  sessionId: string,
  raw: unknown,
): Promise<OfflineSyncResponse | SessionSyncFailure> {
  const session = await readEmbedSession()
  if (!session) return { error: 'Session expired; reopen the page', code: 'session_expired', status: 401 }

  const parsed = SessionSyncBatchSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message, status: 400 }
  const { deviceId, deviceNow } = parsed.data

  let ctx: Awaited<ReturnType<typeof embedContextFor>>
  try {
    ctx = await embedContextFor(session)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Not authorised', status: 403 }
  }
  const { db, orgId } = ctx
  const { data: event } = await db
    .from('events').select('id').eq('id', eventId).eq('org_id', orgId).maybeSingle()
  if (!event) return { error: 'Event not found or access denied', status: 403 }

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

  const { data: sessionRow } = await db
    .from('sessions').select('id').eq('id', sessionId).eq('event_id', eventId).maybeSingle()
  if (!sessionRow) return refuseAll(SESSION_NOT_FOUND_REASON)

  const grant = await verifyOfflineGrant(parsed.data.grant, { surface: 'embed', eventId, sessionId })
  if (!grant || grant.orgId !== orgId) return refuseAll(GRANT_EXPIRED_REASON)
  // R88: identity is the grant's. When it named an org member, that email must
  // still resolve to exactly that member.
  // Only a definite answer refuses; a failed lookup leaves the entries to retry.
  if (grant.userId) {
    let current: EmbedStaff
    try {
      current = await resolveEmbedStaffStrict(db, orgId, grant.email?.trim().toLowerCase() || null)
    } catch (e) {
      console.error('[embed-checkin] grant staff re-check failed, device will retry:', e)
      return retryAll()
    }
    if (current.checked_in_by !== grant.userId) return refuseAll(GRANT_PERMISSION_LOST_REASON)
  }
  const staff: EmbedStaff = { checked_in_by: grant.userId, checked_in_by_email: grant.email }

  const floor = grantScanFloor(grant)
  // Sequential: two queued scans of one attendee must not race.
  for (const entry of valid) {
    const time = resolveScanTime(entry.scannedAt, { deviceNow, floor })
    if (!time.ok) {
      results.push({ entryId: entry.entryId, status: 'refused', reason: time.reason, kind: entry.kind })
      continue
    }
    const offline: OfflineWrite = {
      checkedInAt: time.checkedInAt,
      clientScannedAt: time.clientScannedAt,
      clientEntryId: entry.entryId,
    }
    try {
      const { method, r } = await embedSyncSessionEntry(db, orgId, eventId, sessionId, entry, deviceId, staff, offline)
      const result: OfflineEntryResult = { ...offlineResult(entry.entryId, r, time.clamped), kind: entry.kind }
      results.push(result)
      if (result.status === 'accepted' && r.registration) {
        await logAudit(null, orgId, grant.userId, 'checkin.scan', 'registrations', r.registration.id,
          { method, offline: true, kind: entry.kind }, { eventId })
      }
    } catch (e) {
      console.error('[embed-checkin] offline session entry failed, device will retry:', e)
      results.push({ entryId: entry.entryId, status: 'retry', reason: 'Server error', kind: entry.kind })
    }
  }

  return { processed: results.filter(r => r.status === 'accepted').length, total: parsed.data.entries.length, results }
}

async function embedSyncSessionEntry(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  eventId: string,
  sessionId: string,
  entry: SessionSyncEntry,
  deviceId: string,
  staff: EmbedStaff,
  offline: OfflineWrite,
): Promise<{ method: 'qr_scan' | 'manual' | 'override'; r: CheckInResult }> {
  const write = (reg: SessionScanReg, method: 'qr_scan' | 'manual' | 'override') =>
    embedWriteSessionCheckIn(db, orgId, eventId, sessionId, reg, method, deviceId, async () => staff, offline)
  if (entry.kind === 'scan' || entry.kind === 'recheck') {
    // R85: a recheck is judged exactly like a live scan (R79 + R80).
    const found = await embedLookupScanReg(db, eventId, entry.token, true)
    if ('error' in found) return { method: 'qr_scan', r: { success: false, error: found.error } }
    return { method: 'qr_scan', r: await write(found.reg, 'qr_scan') }
  }
  const { data, error } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('id', entry.registrationId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { method: entry.kind, r: { success: false, error: 'Attendee not found' } }
  return { method: entry.kind, r: await write(data as unknown as SessionScanReg, entry.kind) }
}

export async function embedGetSessionCheckInAttendees(
  eventId: string,
  sessionId: string,
): Promise<SessionAttendeeRow[]> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  await assertSessionOwnership(db, eventId, sessionId)

  const { data } = await db
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
