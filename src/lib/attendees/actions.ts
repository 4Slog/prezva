'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import type { Registration } from '@/types/database'

// RFC 4180-compliant CSV parser — handles quoted fields with embedded commas and newlines
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else { field += ch }
    } else {
      if (ch === '"') { inQuotes = true }
      else if (ch === ',') { row.push(field); field = '' }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(field); field = ''
        if (row.some(f => f)) rows.push(row)
        row = []
      } else { field += ch }
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f)) rows.push(row) }
  return rows
}

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

const ManualAddSchema = z.object({
  eventId: z.string().uuid(),
  attendeeName: z.string().min(1).max(200),
  attendeeEmail: z.string().email(),
  ticketTypeId: z.string().uuid(),
  amountPaidCents: z.number().int().min(0).default(0),
  paymentMethod: z.enum(['comp','cash','card','invoice','other']).default('comp'),
})

const UpdateAttendeeSchema = z.object({
  registrationId: z.string().uuid(),
  attendeeName: z.string().min(1).max(200).optional(),
  attendeeEmail: z.string().email().optional(),
  status: z.enum(['confirmed', 'cancelled', 'waitlisted']).optional(),
})

async function assertOrgMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
) {
  const { data: event } = await supabase
    .from('events').select('org_id').eq('id', eventId).single()
  if (!event) throw new Error('Event not found')
  const { data: member } = await supabase
    .from('org_members').select('role')
    .eq('org_id', (event as any).org_id)
    .eq('user_id', userId).single()
  if (!member) throw new Error('Not authorised')
  return event
}

export async function getAttendees(
  eventId: string,
  filters: AttendeeFilters = {},
): Promise<AttendeePage> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
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
  const user = await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('registrations')
    .select('*, ticket_types!inner(name, price_cents), check_ins(checked_in_at)')
    .eq('id', registrationId)
    .single()
  if (error || !data) throw new Error('Attendee not found')
  await assertOrgMember(supabase, user.id, (data as any).event_id)
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
  const user = await requireUser()
  const parsed = ManualAddSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { eventId, attendeeName, attendeeEmail, ticketTypeId, amountPaidCents, paymentMethod } = parsed.data
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const { data: ev } = await supabase
    .from('events').select('capacity, registration_count').eq('id', eventId).single()
  if ((ev as any)?.capacity && ((ev as any).registration_count ?? 0) >= (ev as any).capacity) {
    return { error: 'Event is at capacity' }
  }

  const qr = 'PREZVA-' + randomBytes(12).toString('hex').toUpperCase()
  const { data, error } = await supabase
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
  await logAudit(supabase, null, user.id, 'attendee.add', 'registration', data.id, { eventId, email: attendeeEmail })
  revalidatePath('/events')
  return { data }
}

export async function updateAttendee(raw: unknown) {
  const user = await requireUser()
  const parsed = UpdateAttendeeSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { registrationId, ...updates } = parsed.data
  const supabase = await createClient()
  const { data: reg } = await supabase
    .from('registrations').select('event_id').eq('id', registrationId).single()
  if (!reg) return { error: 'Registration not found' }
  await assertOrgMember(supabase, user.id, (reg as any).event_id)

  const { data, error } = await supabase
    .from('registrations').update(updates).eq('id', registrationId).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function removeAttendee(registrationId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: reg } = await supabase
    .from('registrations').select('event_id').eq('id', registrationId).single()
  if (!reg) return { error: 'Registration not found' }
  await assertOrgMember(supabase, user.id, (reg as any).event_id)
  const { error } = await supabase
    .from('registrations').update({ status: 'cancelled' }).eq('id', registrationId)
  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'attendee.cancel', 'registration', registrationId)
  revalidatePath('/events')
  return { success: true }
}

export async function exportAttendeesCSV(eventId: string): Promise<string> {
  const { attendees } = await getAttendees(eventId, { pageSize: 10000 })
  const headers = ['Name', 'Email', 'Ticket', 'Status', 'Amount Paid', 'Checked In', 'Check-In Time', 'Registered At']
  const rows = attendees.map(a => [
    a.attendee_name, a.attendee_email, a.ticket_name, a.status,
    ((a.amount_paid_cents ?? 0) / 100).toFixed(2),
    a.checked_in ? 'Yes' : 'No',
    a.check_in_time ? new Date(a.check_in_time).toLocaleString() : '',
    new Date(a.created_at ?? '').toLocaleString(),
  ])
  return [headers, ...rows]
    .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
    .join('\n')
}

export async function importAttendeesCSV(eventId: string, csv: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const { data: tickets } = await supabase
    .from('ticket_types').select('id')
    .eq('event_id', eventId).eq('type', 'free').limit(1)
  const ticketId = (tickets as any)?.[0]?.id
  if (!ticketId) return { error: 'No free ticket type found. Create one first.' }

  const rows = parseCSV(csv).slice(1) // drop header row
  const errors: string[] = []
  let imported = 0

  for (const cols of rows) {
    const [name, email] = cols
    if (!name || !email || !email.includes('@')) {
      errors.push('Skipped: ' + cols.join(',').slice(0, 60))
      continue
    }
    const qr = 'PREZVA-' + randomBytes(12).toString('hex').toUpperCase()
    const { error } = await supabase.from('registrations').insert({
      event_id: eventId,
      ticket_type_id: ticketId,
      attendee_email: email.trim(),
      attendee_name: name.trim(),
      status: 'confirmed',
      qr_code: qr,
      amount_paid_cents: 0,
      payment_method: 'comp',
    })
    if (error) errors.push(name + ' <' + email + '>: ' + error.message)
    else imported++
  }

  revalidatePath('/events')
  return { imported, errors }
}
