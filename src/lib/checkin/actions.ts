'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

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

  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .select('id, user_id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode.toLowerCase())
    .single()

  if (regErr || !reg) return { success: false, error: 'QR code not found for this event' }
  if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }

  const { data: existing } = await supabase
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

  const { error: ciErr } = await supabase.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    checked_in_by: user.id,
    method: 'qr_scan',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  if (ciErr) return { success: false, error: ciErr.message }

  await logAudit(supabase, null, user.id, 'checkin.scan', 'registrations', (reg as any).id, { method: 'qr_scan' })

  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints(eventId, (reg as any).user_id, 'checkin').catch(() => {})
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

  await logAudit(supabase, null, user.id, 'checkin.scan', 'registrations', registrationId, { method: 'manual' })

  if ((reg as any).user_id) {
    const { awardPoints } = await import('@/lib/engagement/sprint10-actions')
    await awardPoints(eventId, (reg as any).user_id, 'checkin').catch(() => {})
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

const OfflineSyncSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().min(1),
  entries: z.array(z.object({
    qr_code: z.string().min(1),
    scanned_at: z.string(),
  })),
})

export async function processOfflineQueue(raw: unknown) {
  const user = await requireUser()
  const parsed = OfflineSyncSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { eventId, deviceId, entries } = parsed.data
  const supabase = await createClient()
  const event = await getEventOrg(supabase, eventId)
  try { await assertPermission(event.org_id, user.id, 'checkin.manage') } catch (e) { return catchPermission(e) }

  const results = await Promise.all(
    entries.map(entry => checkInByQR(eventId, entry.qr_code.toLowerCase(), deviceId))
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

export async function checkInToSession(
  registrationId: string,
  sessionId: string,
  method: string = 'self',
): Promise<{ ok: boolean; alreadyCheckedIn?: boolean; error?: string }> {
  const supabase = createAdminClient()

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, event_id, status')
    .eq('id', registrationId)
    .maybeSingle()

  if (!reg) return { ok: false, error: 'Registration not found' }
  if (reg.status !== 'confirmed' && reg.status !== 'checked_in') {
    return { ok: false, error: 'Registration is not confirmed' }
  }

  const { data: session } = await supabase
    .from('sessions')
    .select('id, event_id')
    .eq('id', sessionId)
    .maybeSingle()

  if (!session || session.event_id !== reg.event_id) {
    return { ok: false, error: 'Session not found for this event' }
  }

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('registration_id', registrationId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (existing) return { ok: true, alreadyCheckedIn: true }

  const { error } = await supabase.from('check_ins').insert({
    registration_id: registrationId,
    event_id: reg.event_id,
    session_id: sessionId,
    method,
    checked_in_at: new Date().toISOString(),
    synced_at: new Date().toISOString(),
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, alreadyCheckedIn: false }
}

// ── Org-authed session check-in (wraps the admin checkInToSession with auth guard) ─
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

  let registrationId: string
  if (method === 'qr_scan') {
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, attendee_name, attendee_email, status, ticket_types(name)')
      .eq('event_id', eventId)
      .eq('qr_code', qrCodeOrRegId.toLowerCase())
      .single()
    if (!reg) return { success: false, error: 'QR code not found for this event' }
    if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
    registrationId = (reg as any).id
    const result = await checkInToSession(registrationId, sessionId, method)
    if (!result.ok) return { success: false, error: result.error }
    return {
      success: true,
      registration: {
        id: (reg as any).id,
        attendee_name: (reg as any).attendee_name,
        attendee_email: (reg as any).attendee_email,
        ticket_name: (reg as any).ticket_types?.name ?? '',
        already_checked_in: !!result.alreadyCheckedIn,
      },
    }
  } else {
    const { data: reg } = await supabase
      .from('registrations')
      .select('id, attendee_name, attendee_email, status, ticket_types(name)')
      .eq('id', qrCodeOrRegId)
      .eq('event_id', eventId)
      .single()
    if (!reg) return { success: false, error: 'Attendee not found' }
    if ((reg as any).status === 'cancelled') return { success: false, error: 'Registration is cancelled' }
    const result = await checkInToSession((reg as any).id, sessionId, method)
    if (!result.ok) return { success: false, error: result.error }
    return {
      success: true,
      registration: {
        id: (reg as any).id,
        attendee_name: (reg as any).attendee_name,
        attendee_email: (reg as any).attendee_email,
        ticket_name: (reg as any).ticket_types?.name ?? '',
        already_checked_in: !!result.alreadyCheckedIn,
      },
    }
  }
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
