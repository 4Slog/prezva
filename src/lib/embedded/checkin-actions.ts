'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { getGhlOrgConfig, type GhlStageKey } from '@/lib/integrations/ghl/org-config'
import { parseScanToken, GHL_TICKET_NOT_REGISTERED } from '@/lib/checkin/scan-token'

export type { CheckInResult, CheckInStats, RecentCheckIn, SessionAttendeeRow } from '@/lib/checkin/actions'

import type { CheckInResult, CheckInStats, RecentCheckIn, SessionAttendeeRow } from '@/lib/checkin/actions'

// ── Embed context ─────────────────────────────────────────────────────────────

async function resolveEmbedContext() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) throw new Error('No embed session')
  const session = await verifyEmbeddedSession(token)
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
  if (!staffEmail) return { checked_in_by: null, checked_in_by_email: null }
  try {
    // ilike for case-insensitivity; the exact compare below neutralises any
    // wildcard PostgREST still honours (it rewrites '*' to '%').
    const pattern = staffEmail.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email')
      .ilike('email', pattern)
      .limit(20)
    const ids = (profiles ?? [])
      .filter(p => p.email?.trim().toLowerCase() === staffEmail)
      .map(p => p.id)
    if (ids.length === 0) return { checked_in_by: null, checked_in_by_email: staffEmail }
    const { data: members } = await db
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .in('user_id', ids)
    const memberIds = [...new Set((members ?? []).map(m => m.user_id))]
    // Two member profiles sharing one email is ambiguous — record the email only.
    return { checked_in_by: memberIds.length === 1 ? memberIds[0] : null, checked_in_by_email: staffEmail }
  } catch (e) {
    console.error('[embed-checkin] staff lookup failed (email still recorded):', e)
    return { checked_in_by: null, checked_in_by_email: staffEmail }
  }
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
  if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
  if ((reg as any).status === 'refunded') return { success: false, error: 'Registration was refunded' }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
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

  const { error: ciErr } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    checked_in_by: null,
    checked_in_source: 'embed',
    method: 'qr_scan',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

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
  if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
  if ((reg as any).status === 'refunded') return { success: false, error: 'Registration was refunded' }

  const { data: existing } = await db
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

  const { error } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: registrationId,
    checked_in_by: null,
    checked_in_source: 'embed',
    method: 'manual',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

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

const OfflineSyncSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().min(1),
  entries: z.array(z.object({
    qr_code: z.string().min(1),
    scanned_at: z.string(),
  })),
})

export async function processOfflineQueue(raw: unknown) {
  const parsed = OfflineSyncSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { eventId, deviceId, entries } = parsed.data
  // Verify embed context before processing
  const { orgId } = await resolveEmbedContext()
  const db = createAdminClient()
  const { data: eventRow } = await db.from('events').select('id').eq('id', eventId).eq('org_id', orgId).maybeSingle()
  if (!eventRow) return { error: 'Event not found or access denied' }

  const results = await Promise.all(
    entries.map(entry => checkInByQRInternal(db, orgId, eventId, entry.qr_code.toLowerCase(), deviceId))
  )

  let processed = 0
  const errors: string[] = []
  const failedQrCodes: string[] = []

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.success && !result.registration?.already_checked_in) {
      processed++
    } else if (!result.success) {
      errors.push(entries[i].qr_code + ': ' + result.error)
      failedQrCodes.push(entries[i].qr_code)
    }
  }

  return { processed, total: entries.length, errors, failedQrCodes }
}

// Internal variant used by processOfflineQueue to avoid re-resolving embed context N times
async function checkInByQRInternal(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  eventId: string,
  qrCode: string,
  deviceId: string,
): Promise<CheckInResult> {
  const { data: reg, error: regErr } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode)
    .single()

  if (regErr || !reg) return { success: false, error: 'QR code not found for this event' }
  if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
  if ((reg as any).status === 'refunded') return { success: false, error: 'Registration was refunded' }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
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

  const { error: ciErr } = await db.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    checked_in_by: null,
    checked_in_source: 'offline_sync',
    method: 'qr_scan',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

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

export async function searchAttendeesForCheckIn(eventId: string, query: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  if (!query || query.length < 2) return []

  // Escape PostgREST filter metacharacters to prevent filter injection
  const safe = query.replace(/\\/g, '\\\\').replace(/[,()]/g, m => '\\' + m)

  const { data } = await db
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, delivery_method, ticket_types(name), check_ins(id, checked_in_at)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .or('attendee_name.ilike.%' + safe + '%,attendee_email.ilike.%' + safe + '%')
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

// R80: session scanners are confirmed-only, with the dashboard's wording.
function sessionStatusError(status: string): string | null {
  if (status === 'cancelled') return 'Registration is cancelled'
  if (status === 'refunded') return 'Registration was refunded'
  if (status !== 'confirmed') return 'Registration is not confirmed'
  return null
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

  const token = parseScanToken(qrCode)
  let reg: SessionScanReg
  if (token.kind === 'ghl') {
    // R79: event-scoped. A token registered on another event is indistinguishable
    // from an unknown one here — never reveal which event it belongs to.
    const { data } = await db
      .from('registrations')
      .select('id, attendee_name, attendee_email, status, ticket_types(name)')
      .eq('event_id', eventId)
      .eq('ghl_attendee_id', token.attendeeId)
      .maybeSingle()
    if (!data) return { success: false, error: GHL_TICKET_NOT_REGISTERED, canOverride: true }
    reg = data as unknown as SessionScanReg
  } else {
    // A2: Prezva's own QR — and anything unrecognised — takes the qr_code lookup
    // exactly as before (manual-add and transfer codes are not 32-hex).
    const { data, error: regErr } = await db
      .from('registrations')
      .select('id, attendee_name, attendee_email, status, ticket_types(name)')
      .eq('event_id', eventId)
      .eq('qr_code', token.kind === 'prezva' ? token.qrCode : qrCode.toLowerCase())
      .single()
    if (regErr || !data) return { success: false, error: 'QR code not found for this event' }
    reg = data as unknown as SessionScanReg
  }
  const statusError = sessionStatusError(reg.status)
  if (statusError) return { success: false, error: statusError }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', (reg as any).id)
    .eq('session_id', sessionId)
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
    session_id: sessionId,
    registration_id: reg.id,
    ...(await resolveEmbedStaff(db, orgId, staffEmail)),
    checked_in_source: 'embed',
    method: 'qr_scan',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  if (ciErr) return { success: false, error: ciErr.message }

  await fireGhlStageMove(db, (reg as any).id, orgId, 'attendedSession')

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
  const reg = data as unknown as SessionScanReg
  const statusError = sessionStatusError(reg.status)
  if (statusError) return { success: false, error: statusError }

  const registration = {
    id: reg.id,
    attendee_name: reg.attendee_name,
    attendee_email: reg.attendee_email,
    ticket_name: reg.ticket_types?.name ?? '',
  }

  const { data: existing } = await db
    .from('check_ins')
    .select('id, checked_in_at')
    .eq('registration_id', reg.id)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (existing) {
    return {
      success: true,
      registration: { ...registration, already_checked_in: true, check_in_time: existing.checked_in_at ?? undefined },
    }
  }

  const { error } = await db.from('check_ins').insert({
    event_id: eventId,
    session_id: sessionId,
    registration_id: reg.id,
    ...(await resolveEmbedStaff(db, orgId, staffEmail)),
    checked_in_source: 'embed',
    method,
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }

  await fireGhlStageMove(db, reg.id, orgId, 'attendedSession')

  return { success: true, registration: { ...registration, already_checked_in: false } }
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
