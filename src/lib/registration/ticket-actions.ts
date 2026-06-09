'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const TicketSchema = z.object({
  name:                z.string().min(1).max(80),
  description:         z.string().max(500).optional(),
  type:                z.enum(['free', 'paid', 'donation']).default('free'),
  price_cents:         z.coerce.number().int().min(0).default(0),
  currency:            z.string().length(3).default('usd'),
  quantity:            z.coerce.number().int().min(1).optional(),
  max_per_order:       z.coerce.number().int().min(1).max(100).default(10),
  sale_starts_at:      z.string().datetime().optional(),
  sale_ends_at:        z.string().datetime().optional(),
  is_visible:          z.coerce.boolean().default(true),
  sort_order:          z.coerce.number().int().default(0),
  membership_required: z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  membership_provider: z.string().nullable().optional(),
  waitlist_enabled:    z.preprocess(v => v === 'true' || v === true, z.boolean()).default(false),
  delivery_method:     z.enum(['in_person', 'virtual', 'both']).default('in_person'),
})

async function getEventOrgId(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('events').select('org_id').eq('id', eventId).single()
  return data?.org_id as string | undefined
}

export async function createTicketType(eventId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }

  const raw: Record<string, unknown> = {}
  for (const [k, v] of formData.entries()) {
    raw[k] = v === '' ? undefined : v
  }
  raw.type = raw.type || 'free'

  const parsed = TicketSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Free tickets must have price 0
  if (parsed.data.type === 'free') parsed.data.price_cents = 0

  const { data, error } = await supabase
    .from('ticket_types')
    .insert({ ...parsed.data, event_id: eventId })
    .select()
    .single()

  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'ticket.create', 'ticket_types', data.id, { name: parsed.data.name })
  revalidatePath(`/events/[slug]/tickets`)
  return { data }
}

export async function updateTicketType(ticketId: string, eventId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const orgId = await getEventOrgId(eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'event.tickets') } catch (e) { return catchPermission(e) }

  const raw: Record<string, unknown> = {}
  for (const key of TicketSchema.keyof().options) {
    const v = formData.get(key)
    if (v !== null && v !== '') raw[key] = v
  }

  const parsed = TicketSchema.partial().safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data, error } = await supabase
    .from('ticket_types')
    .update(parsed.data)
    .eq('id', ticketId)
    .eq('event_id', eventId)
    .select()
    .single()

  if (error) return { error: error.message }
  await logAudit(supabase, null, user.id, 'ticket.update', 'ticket_types', ticketId)
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
  await logAudit(supabase, null, user.id, 'ticket.delete', 'ticket_types', ticketId)
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
