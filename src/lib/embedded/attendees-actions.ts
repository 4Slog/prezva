'use server'

import { cookies } from 'next/headers'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { randomBytes } from 'crypto'
import type { Registration } from '@/types/database'

// ── Re-export shared types so embed pages can import from one place ────────────

export interface AttendeeWithTicket extends Registration {
  ticket_name: string
  ticket_price_cents: number
  checked_in: boolean
  check_in_time: string | null
}

export interface AttendeeFilters {
  search?: string
  status?: string
  ticketTypeId?: string
  page?: number
  pageSize?: number
}

export interface AttendeePage {
  attendees: AttendeeWithTicket[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ── Validation schemas ────────────────────────────────────────────────────────

const ManualAddSchema = z.object({
  eventId: z.string().uuid(),
  attendeeName: z.string().min(1).max(200),
  attendeeEmail: z.string().email(),
  ticketTypeId: z.string().uuid(),
  amountPaidCents: z.number().int().min(0).default(0),
  paymentMethod: z.enum(['comp', 'cash', 'card', 'invoice', 'other']).default('comp'),
})

const UpdateAttendeeSchema = z.object({
  registrationId: z.string().uuid(),
  attendeeName: z.string().min(1).max(200).optional(),
  attendeeEmail: z.string().email().optional(),
  status: z.enum(['confirmed', 'cancelled', 'waitlisted']).optional(),
})

// ── Embed context (session → location → org) ─────────────────────────────────

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
  return { db, orgId: link.org_id }
}

// Verify event belongs to this embed's org (defense-in-depth)
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

// ── Server Actions ─────────────────────────────────────────────────────────────

export async function getAttendees(
  eventId: string,
  filters: AttendeeFilters = {},
): Promise<AttendeePage> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = db
    .from('registrations')
    .select('*, ticket_types!inner(name, price_cents), check_ins(checked_in_at)', { count: 'exact' })
    .eq('event_id', eventId)

  if (filters.search) {
    const s = filters.search
    query = (query as any).or(`attendee_name.ilike.%${s}%,attendee_email.ilike.%${s}%`)
  }
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.ticketTypeId) query = query.eq('ticket_type_id', filters.ticketTypeId)

  const { data, count, error } = await query
    .range(from, to)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const attendees: AttendeeWithTicket[] = ((data ?? []) as any[]).map(r => ({
    ...r,
    ticket_name: r.ticket_types?.name ?? '',
    ticket_price_cents: r.ticket_types?.price_cents ?? 0,
    checked_in: (r.check_ins?.length ?? 0) > 0,
    check_in_time: r.check_ins?.[0]?.checked_in_at ?? null,
  }))

  return {
    attendees,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function getAttendee(registrationId: string): Promise<AttendeeWithTicket> {
  const { db, orgId } = await resolveEmbedContext()
  const { data, error } = await db
    .from('registrations')
    .select('*, ticket_types!inner(name, price_cents), check_ins(checked_in_at)')
    .eq('id', registrationId)
    .single()
  if (error || !data) throw new Error('Attendee not found')
  // Verify the registration's event belongs to this org
  await assertEventOwnership(db, (data as any).event_id, orgId)
  const d = data as any
  return {
    ...d,
    ticket_name: d.ticket_types?.name ?? '',
    ticket_price_cents: d.ticket_types?.price_cents ?? 0,
    checked_in: (d.check_ins?.length ?? 0) > 0,
    check_in_time: d.check_ins?.[0]?.checked_in_at ?? null,
  }
}

export async function manualAddAttendee(raw: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  const parsed = ManualAddSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { eventId, attendeeName, attendeeEmail, ticketTypeId, amountPaidCents, paymentMethod } = parsed.data
  await assertEventOwnership(db, eventId, orgId)

  const { data: ev } = await db
    .from('events').select('capacity, registration_count').eq('id', eventId).single()
  if ((ev as any)?.capacity && ((ev as any).registration_count ?? 0) >= (ev as any).capacity) {
    return { error: 'Event is at capacity' }
  }

  const qr = 'PREZVA-' + randomBytes(12).toString('hex').toUpperCase()
  const { data, error } = await db
    .from('registrations')
    .insert({
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      attendee_email: attendeeEmail,
      attendee_name: attendeeName,
      status: 'confirmed',
      qr_code: qr,
      amount_paid_cents: amountPaidCents,
      payment_method: paymentMethod,
    })
    .select().single()

  if (error) return { error: error.message }
  return { data }
}

export async function updateAttendee(raw: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  const parsed = UpdateAttendeeSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { registrationId, ...updates } = parsed.data
  const { data: reg } = await db
    .from('registrations').select('event_id').eq('id', registrationId).single()
  if (!reg) return { error: 'Registration not found' }
  await assertEventOwnership(db, (reg as any).event_id, orgId)

  const { data, error } = await db
    .from('registrations').update(updates).eq('id', registrationId).select().single()
  if (error) return { error: error.message }
  return { data }
}

export async function removeAttendee(registrationId: string) {
  const { db, orgId } = await resolveEmbedContext()
  const { data: reg } = await db
    .from('registrations').select('event_id').eq('id', registrationId).single()
  if (!reg) return { error: 'Registration not found' }
  await assertEventOwnership(db, (reg as any).event_id, orgId)
  const { error } = await db
    .from('registrations').update({ status: 'cancelled' }).eq('id', registrationId)
  if (error) return { error: error.message }
  return { success: true }
}
