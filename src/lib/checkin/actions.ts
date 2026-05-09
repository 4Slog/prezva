'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
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

async function assertOrgMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
) {
  const { data: event } = await supabase
    .from('events').select('org_id, id').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')
  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id).eq('user_id', userId).single()
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
  await assertOrgMember(supabase, user.id, eventId)

  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
    .eq('event_id', eventId)
    .eq('qr_code', qrCode)
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
  await assertOrgMember(supabase, user.id, eventId)

  const { data: reg } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name)')
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
    method: 'manual_search',
    device_id: deviceId,
    synced_at: new Date().toISOString(),
  })

  if (error) return { success: false, error: error.message }
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
  await assertOrgMember(supabase, user.id, eventId)

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

  const [eventResult, recentResult] = await Promise.all([
    supabase
      .from('events')
      .select('registration_count, checked_in_count')
      .eq('id', eventId)
      .single(),
    supabase
      .from('check_ins')
      .select('id, checked_in_at, method, registrations(attendee_name, attendee_email, ticket_types(name))')
      .eq('event_id', eventId)
      .is('session_id', null)
      .order('checked_in_at', { ascending: false })
      .limit(20),
  ])

  const ev = eventResult.data as any
  const total = ev?.registration_count ?? 0
  const checked = ev?.checked_in_count ?? 0

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
  await assertOrgMember(supabase, user.id, eventId)

  let processed = 0
  const errors: string[] = []

  for (const entry of entries) {
    const result = await checkInByQR(eventId, entry.qr_code, deviceId)
    if (result.success && !result.registration?.already_checked_in) {
      processed++
    } else if (!result.success) {
      errors.push(entry.qr_code + ': ' + result.error)
    }
  }

  return { processed, total: entries.length, errors }
}

export async function searchAttendeesForCheckIn(eventId: string, query: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  if (!query || query.length < 2) return []

  const { data } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name), check_ins(id, checked_in_at)')
    .eq('event_id', eventId)
    .neq('status', 'cancelled')
    .or('attendee_name.ilike.%' + query + '%,attendee_email.ilike.%' + query + '%')
    .limit(10)

  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    attendee_name: r.attendee_name,
    attendee_email: r.attendee_email,
    ticket_name: r.ticket_types?.name ?? '',
    checked_in: (r.check_ins?.length ?? 0) > 0,
    check_in_time: r.check_ins?.[0]?.checked_in_at ?? null,
  }))
}
