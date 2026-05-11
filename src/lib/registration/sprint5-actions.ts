'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'

// ── T-041: Bulk discount code import/export ──────────────────────────────────

export async function bulkImportDiscountCodes(eventId: string, csv: string) {
  await requireUser()
  const supabase = await createClient()

  const lines = csv.trim().split('\n').slice(1) // skip header
  const rows: Array<Record<string, unknown>> = []
  const errors: string[] = []

  for (const line of lines) {
    const [code, type, value, max_uses] = line.split(',').map((s) => s.trim())
    if (!code || !type || !value) { errors.push('Skipped: ' + line.slice(0, 60)); continue }
    if (!['percent', 'fixed'].includes(type)) { errors.push(`Invalid type for ${code}`); continue }
    rows.push({
      event_id: eventId,
      code: code.toUpperCase(),
      discount_type: type,
      discount_value: parseInt(value),
      max_uses: max_uses ? parseInt(max_uses) : null,
      is_active: true,
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase.from('discount_codes').insert(rows)
    if (error) return { imported: 0, errors: [error.message] }
  }

  revalidatePath('/events')
  return { imported: rows.length, errors }
}

export async function exportDiscountCodes(eventId: string): Promise<string> {
  await requireUser()
  const supabase = await createClient()

  const { data } = await supabase
    .from('discount_codes')
    .select('code, discount_type, discount_value, max_uses, uses_count, is_active, valid_from, valid_until')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  if (!data) return 'code,discount_type,discount_value,max_uses,uses_count,is_active'

  const header = 'code,discount_type,discount_value,max_uses,uses_count,is_active,valid_from,valid_until'
  const rows = data.map((d) =>
    [d.code, d.discount_type, d.discount_value, d.max_uses ?? '', d.uses_count, d.is_active, d.valid_from ?? '', d.valid_until ?? ''].join(',')
  )
  return [header, ...rows].join('\n')
}

// ── T-046: Invite-only allowlist ──────────────────────────────────────────────

export async function getTicketAllowlist(ticketTypeId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ticket_invite_allowlist')
    .select('id, email, created_at')
    .eq('ticket_type_id', ticketTypeId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function addToTicketAllowlist(ticketTypeId: string, emails: string[]) {
  await requireUser()
  const supabase = await createClient()
  const rows = emails
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'))
    .map((email) => ({ ticket_type_id: ticketTypeId, email }))

  if (rows.length === 0) return { added: 0, errors: ['No valid emails provided'] }

  const { error } = await supabase
    .from('ticket_invite_allowlist')
    .upsert(rows, { onConflict: 'ticket_type_id,email' })

  if (error) return { added: 0, errors: [error.message] }
  revalidatePath('/events')
  return { added: rows.length, errors: [] }
}

export async function removeFromTicketAllowlist(allowlistId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('ticket_invite_allowlist').delete().eq('id', allowlistId)
  revalidatePath('/events')
}

// ── T-049/050/051: Custom form fields ────────────────────────────────────────

export async function getFormFields(eventId: string, ticketTypeId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('form_fields')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (ticketTypeId) {
    query = query.or(`ticket_type_id.eq.${ticketTypeId},ticket_type_id.is.null`)
  }

  const { data } = await query
  return data ?? []
}

export async function createFormField(eventId: string, field: {
  ticket_type_id?: string | null
  field_key: string
  label: string
  field_type: string
  options?: unknown[]
  is_required?: boolean
  sort_order?: number
}) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('form_fields').insert({ event_id: eventId, ...field })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteFormField(fieldId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('form_fields').delete().eq('id', fieldId)
  revalidatePath('/events')
}

// ── T-052: Per-ticket email template ─────────────────────────────────────────

export async function updateTicketEmailTemplate(
  ticketTypeId: string,
  subject: string,
  body: string,
) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase
    .from('ticket_types')
    .update({ confirmation_email_subject: subject, confirmation_email_body: body })
    .eq('id', ticketTypeId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ── T-053a: Abandoned cart capture ───────────────────────────────────────────

export async function captureAbandonedCart(eventId: string, email: string, ticketTypeId?: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('abandoned_carts').upsert(
    { event_id: eventId, email: email.toLowerCase(), ticket_type_id: ticketTypeId ?? null },
    { onConflict: 'event_id,email', ignoreDuplicates: false },
  )
  if (error) return { error: error.message }
  return { success: true }
}

// ── T-042: Add-ons CRUD ───────────────────────────────────────────────────────

export async function getEventAddOns(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('add_ons')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  return data ?? []
}

export async function createAddOn(eventId: string, data: {
  name: string
  description?: string
  price_cents: number
  quantity?: number
}) {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from('add_ons').insert({ event_id: eventId, ...data })
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteAddOn(addOnId: string) {
  await requireUser()
  const supabase = await createClient()
  await supabase.from('add_ons').update({ is_active: false }).eq('id', addOnId)
  revalidatePath('/events')
}

// ── T-053: Session access control per ticket ──────────────────────────────────

export async function setSessionTicketAccess(sessionId: string, ticketTypeIds: string[]) {
  await requireUser()
  const supabase = await createClient()

  await supabase.from('session_ticket_access').delete().eq('session_id', sessionId)

  if (ticketTypeIds.length > 0) {
    const rows = ticketTypeIds.map((tid) => ({ session_id: sessionId, ticket_type_id: tid }))
    const { error } = await supabase.from('session_ticket_access').insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath('/events')
  return { success: true }
}

export async function getSessionTicketAccess(sessionId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('session_ticket_access')
    .select('ticket_type_id')
    .eq('session_id', sessionId)
  return (data ?? []).map((r) => r.ticket_type_id)
}

// ── T-047: Session RSVP at registration ──────────────────────────────────────

export async function rsvpToSessions(registrationId: string, sessionIds: string[]) {
  const supabase = await createClient()
  const { data: reg } = await supabase
    .from('registrations')
    .select('user_id')
    .eq('id', registrationId)
    .single()

  if (!reg?.user_id) return { error: 'Must be logged in to bookmark sessions' }

  const rows = sessionIds.map((sid) => ({
    user_id: reg.user_id,
    session_id: sid,
  }))

  if (rows.length > 0) {
    await supabase.from('session_bookmarks').upsert(rows, { onConflict: 'user_id,session_id' })
  }

  return { success: true }
}

// ── T-048: Post-registration purchases ────────────────────────────────────────

export async function getRegistrationPurchases(registrationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('registration_add_ons')
    .select('*, add_ons(name, description, price_cents)')
    .eq('registration_id', registrationId)
  return data ?? []
}
