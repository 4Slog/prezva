'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { inputToInstant } from '@/lib/datetime/zoned-input'

const TicketSchema = z.object({
  name:                z.string().min(1).max(80),
  description:         z.string().max(500).optional(),
  type:                z.enum(['free', 'paid', 'donation']).default('free'),
  price_cents:         z.coerce.number().int().min(0).default(0),
  currency:            z.string().length(3).default('usd'),
  quantity:            z.coerce.number().int().min(1).optional(),
  max_per_order:       z.coerce.number().int().min(1).max(100).default(10),
  // O109: a datetime-local wall clock (read in the event's zone) or an instant.
  sale_starts_at:      z.string().optional(),
  sale_ends_at:        z.string().optional(),
  is_visible:          z.coerce.boolean().default(true),
  sort_order:          z.coerce.number().int().default(0),
  membership_required: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  membership_provider: z.string().nullable().optional(),
  waitlist_enabled:    z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  delivery_method:     z.enum(['in_person', 'virtual', 'both']).default('in_person'),
})

async function getEventOrgId(eventId: string) {
  return (await getEventOrgAndZone(eventId))?.orgId
}

async function getEventOrgAndZone(eventId: string): Promise<{ orgId: string; timezone: string } | undefined> {
  const supabase = await createClient()
  const { data } = await supabase.from('events').select('org_id, timezone').eq('id', eventId).single()
  return data ? { orgId: data.org_id as string, timezone: data.timezone as string } : undefined
}

// O109: sale window values → instants, reading wall clocks in the event's zone.
function saleWindowToInstants<T extends { sale_starts_at?: string; sale_ends_at?: string }>(
  data: T,
  timezone: string,
): { ok: true; data: T } | { ok: false; error: string } {
  const out = { ...data }
  for (const key of ['sale_starts_at', 'sale_ends_at'] as const) {
    const v = out[key]
    if (v === undefined) continue
    try { out[key] = inputToInstant(v, timezone) as T[typeof key] } catch {
      return { ok: false, error: key === 'sale_starts_at' ? 'Invalid sale start time' : 'Invalid sale end time' }
    }
  }
  if (out.sale_starts_at && out.sale_ends_at && Date.parse(out.sale_ends_at) <= Date.parse(out.sale_starts_at)) {
    return { ok: false, error: 'Sale end must be after sale start' }
  }
  return { ok: true, data: out }
}

export async function createTicketType(eventId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const ev = await getEventOrgAndZone(eventId)
  if (!ev) return { error: 'Event not found' }
  try { await assertPermission(ev.orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }

  const raw: Record<string, unknown> = {}
  for (const [k, v] of formData.entries()) {
    raw[k] = v === '' ? undefined : v
  }
  raw.type = raw.type || 'free'

  const parsed = TicketSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Free tickets must have price 0
  if (parsed.data.type === 'free') parsed.data.price_cents = 0

  const windowed = saleWindowToInstants(parsed.data, ev.timezone)
  if (!windowed.ok) return { error: windowed.error }

  const { data, error } = await supabase
    .from('ticket_types')
    .insert({ ...windowed.data, event_id: eventId })
    .select()
    .single()

  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'ticket.create', 'ticket_types', data.id, { name: parsed.data.name }, { eventId })
  revalidatePath(`/events/[slug]/tickets`)
  return { data }
}

export async function updateTicketType(ticketId: string, eventId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const ev = await getEventOrgAndZone(eventId)
  if (!ev) return { error: 'Event not found' }
  try { await assertPermission(ev.orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }

  const raw: Record<string, unknown> = {}
  for (const key of TicketSchema.keyof().options) {
    const v = formData.get(key)
    if (v !== null && v !== '') raw[key] = v
  }

  const parsed = TicketSchema.partial().safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const windowed = saleWindowToInstants(parsed.data, ev.timezone)
  if (!windowed.ok) return { error: windowed.error }

  const { data, error } = await supabase
    .from('ticket_types')
    .update(windowed.data)
    .eq('id', ticketId)
    .eq('event_id', eventId)
    .select()
    .single()

  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'ticket.update', 'ticket_types', ticketId, undefined, { eventId })
  revalidatePath(`/events/[slug]/tickets`)
  return { data }
}

export async function deleteTicketType(ticketId: string, eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }

  // Cannot delete if any confirmed registrations exist
  const { data: regCount } = await supabase
    .from('registrations')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_type_id', ticketId)
    .in('status', ['confirmed', 'pending'])

  if ((regCount as unknown as number) > 0) {
    return { error: 'Cannot delete a ticket type with active registrations' }
  }

  const { error } = await supabase
    .from('ticket_types')
    .delete()
    .eq('id', ticketId)
    .eq('event_id', eventId)

  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'ticket.delete', 'ticket_types', ticketId, undefined, { eventId })
  revalidatePath(`/events/[slug]/tickets`)
  return { success: true }
}

export async function getEventTickets(eventId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return []
  return data
}
