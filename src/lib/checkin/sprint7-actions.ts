'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

async function assertCheckInAccess(
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
  return event as any
}

// ─── T-075: Walk-in attendee ────────────────────────────────────────────────

const WalkInSchema = z.object({
  attendee_name: z.string().min(1),
  attendee_email: z.string().email(),
  ticket_type_id: z.string().uuid(),
})

export async function createWalkIn(eventId: string, raw: unknown) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)
  const data = WalkInSchema.parse(raw)

  const { data: ticket } = await supabase
    .from('ticket_types')
    .select('price_cents, name')
    .eq('id', data.ticket_type_id)
    .single()
  if (!ticket) return { error: 'Ticket type not found' }

  const qrCode = 'WALKIN-' + crypto.randomUUID().slice(0, 8).toUpperCase()

  const { data: reg, error: regErr } = await supabase
    .from('registrations')
    .insert({
      event_id: eventId,
      attendee_name: data.attendee_name,
      attendee_email: data.attendee_email,
      ticket_type_id: data.ticket_type_id,
      status: 'confirmed',
      payment_status: 'manual',
      amount_paid_cents: 0,
      qr_code: qrCode,
    })
    .select('id, attendee_name, ticket_type_id')
    .single()

  if (regErr) return { error: regErr.message }

  await supabase.from('check_ins').insert({
    event_id: eventId,
    registration_id: (reg as any).id,
    checked_in_by: user.id,
    method: 'walk_in',
    device_id: 'web',
    synced_at: new Date().toISOString(),
  })

  revalidatePath('/events')
  return { data: { id: (reg as any).id, name: data.attendee_name, qr_code: qrCode } }
}

// ─── T-077: Day check-in ────────────────────────────────────────────────────

export async function checkInForDay(eventId: string, registrationId: string, date: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { error } = await supabase.from('daily_check_ins').upsert({
    event_id: eventId,
    registration_id: registrationId,
    check_in_date: date,
    checked_in_by: user.id,
  }, { onConflict: 'registration_id,check_in_date' })

  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function getDailyCheckIns(eventId: string, date: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data } = await supabase
    .from('daily_check_ins')
    .select('id, check_in_date, checked_in_at, registrations(attendee_name, attendee_email, ticket_types(name))')
    .eq('event_id', eventId)
    .eq('check_in_date', date)
    .order('checked_in_at', { ascending: false })

  return ((data ?? []) as any[]).map(d => ({
    id: d.id,
    checked_in_at: d.checked_in_at,
    attendee_name: d.registrations?.attendee_name ?? '',
    attendee_email: d.registrations?.attendee_email ?? '',
    ticket_name: d.registrations?.ticket_types?.name ?? '',
  }))
}

// ─── T-078: Session check-in ─────────────────────────────────────────────────

export async function checkInForSession(
  eventId: string,
  sessionId: string,
  registrationId: string,
) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('registration_id', registrationId)
    .eq('session_id', sessionId)
    .single()

  if (existing) return { success: true, already: true }

  const { error } = await supabase.from('check_ins').insert({
    event_id: eventId,
    registration_id: registrationId,
    session_id: sessionId,
    checked_in_by: user.id,
    method: 'manual_search',
    device_id: 'web',
    synced_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true, already: false }
}

export async function getSessionCheckIns(eventId: string, sessionId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data } = await supabase
    .from('check_ins')
    .select('id, checked_in_at, registrations(attendee_name, attendee_email, ticket_types(name))')
    .eq('event_id', eventId)
    .eq('session_id', sessionId)
    .order('checked_in_at', { ascending: false })

  return ((data ?? []) as any[]).map(c => ({
    id: c.id,
    checked_in_at: c.checked_in_at,
    attendee_name: c.registrations?.attendee_name ?? '',
    attendee_email: c.registrations?.attendee_email ?? '',
    ticket_name: c.registrations?.ticket_types?.name ?? '',
  }))
}

// ─── T-074: Filter check-ins by ticket type ──────────────────────────────────

export async function getCheckInListFiltered(eventId: string, ticketTypeId?: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  let query = supabase
    .from('check_ins')
    .select('id, checked_in_at, method, registrations(id, attendee_name, attendee_email, ticket_type_id, ticket_types(id, name))')
    .eq('event_id', eventId)
    .is('session_id', null)
    .order('checked_in_at', { ascending: false })
    .limit(100)

  if (ticketTypeId) {
    query = query.eq('registrations.ticket_type_id', ticketTypeId)
  }

  const { data } = await query
  return ((data ?? []) as any[])
    .filter(c => c.registrations)
    .map(c => ({
      id: c.id,
      checked_in_at: c.checked_in_at,
      method: c.method,
      attendee_name: c.registrations.attendee_name,
      attendee_email: c.registrations.attendee_email,
      ticket_name: c.registrations.ticket_types?.name ?? '',
      ticket_type_id: c.registrations.ticket_type_id,
    }))
}

// ─── T-082: Waiver verification at check-in ──────────────────────────────────

export async function getWaiverStatusAtCheckIn(eventId: string, registrationId: string) {
  const supabase = await createClient()

  const { data: waivers } = await supabase
    .from('event_waivers')
    .select('id, title, is_required')
    .eq('event_id', eventId)
    .eq('is_required', true)

  if (!waivers?.length) return { blocked: false, unsigned: [] }

  const { data: sigs } = await supabase
    .from('waiver_signatures')
    .select('waiver_id')
    .eq('registration_id', registrationId)

  const signedIds = new Set((sigs ?? []).map((s: any) => s.waiver_id))
  const unsigned = waivers.filter(w => !signedIds.has(w.id))

  return { blocked: unsigned.length > 0, unsigned: unsigned.map(w => ({ id: w.id, title: w.title })) }
}

// ─── T-079+080: Self check-in by email (kiosk) ───────────────────────────────

export async function kioskCheckInByEmail(eventId: string, email: string) {
  const supabase = await createClient()

  const { data: regs } = await supabase
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name), check_ins(id, checked_in_at)')
    .eq('event_id', eventId)
    .ilike('attendee_email', email.trim())
    .neq('status', 'cancelled')

  if (!regs || regs.length === 0) return { found: false }

  const reg = regs[0] as any
  const alreadyIn = (reg.check_ins?.length ?? 0) > 0

  if (!alreadyIn) {
    await supabase.from('check_ins').insert({
      event_id: eventId,
      registration_id: reg.id,
      method: 'self_checkin',
      device_id: 'kiosk',
      synced_at: new Date().toISOString(),
    })
  }

  return {
    found: true,
    attendee_name: reg.attendee_name,
    ticket_name: reg.ticket_types?.name ?? '',
    already_checked_in: alreadyIn,
  }
}

// ─── T-076: Staff management ─────────────────────────────────────────────────

export async function inviteStaffMember(eventId: string, email: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data: existing } = await supabase
    .from('staff_invites')
    .select('id')
    .eq('event_id', eventId)
    .ilike('email', email)
    .is('accepted_at', null)
    .single()

  if (existing) return { error: 'Invite already pending for this email' }

  const { data, error } = await supabase
    .from('staff_invites')
    .insert({ event_id: eventId, email, invited_by: user.id })
    .select('id, token, email')
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function getStaffList(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data } = await supabase
    .from('staff_invites')
    .select('id, email, role, accepted_at, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  return (data ?? []) as any[]
}

export async function revokeStaffInvite(inviteId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: invite } = await supabase
    .from('staff_invites')
    .select('event_id')
    .eq('id', inviteId)
    .single()
  if (!invite) return { error: 'Invite not found' }

  await assertCheckInAccess(supabase, user.id, (invite as any).event_id)

  const { error } = await supabase.from('staff_invites').delete().eq('id', inviteId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ─── T-083-090: Badge templates ──────────────────────────────────────────────

export interface BadgeTemplate {
  id: string
  event_id: string
  name: string
  paper_size: string
  template_json: {
    fields: BadgeField[]
    background: string
    font_family: string
  }
  is_default: boolean
  created_at: string
}

export interface BadgeField {
  id: string
  type: 'name' | 'ticket' | 'company' | 'email' | 'qr_code' | 'logo' | 'custom_text'
  label?: string
  x: number
  y: number
  width: number
  font_size: number
  font_weight: 'normal' | 'bold'
  color: string
  align: 'left' | 'center' | 'right'
  value?: string
}

const BADGE_TEMPLATES_PREBUILT: Array<{ name: string; paper_size: string; template_json: BadgeTemplate['template_json'] }> = [
  {
    name: 'Simple Name Badge',
    paper_size: 'badge_4x3',
    template_json: {
      background: '#ffffff',
      font_family: 'Inter',
      fields: [
        { id: 'f1', type: 'name', x: 10, y: 40, width: 80, font_size: 28, font_weight: 'bold', color: '#0D1B2A', align: 'center' },
        { id: 'f2', type: 'ticket', x: 10, y: 60, width: 80, font_size: 14, font_weight: 'normal', color: '#64748b', align: 'center' },
        { id: 'f3', type: 'qr_code', x: 35, y: 70, width: 30, font_size: 0, font_weight: 'normal', color: '#000000', align: 'center' },
      ],
    },
  },
  {
    name: 'Professional Badge',
    paper_size: 'badge_4x3',
    template_json: {
      background: '#0D1B2A',
      font_family: 'Inter',
      fields: [
        { id: 'f1', type: 'name', x: 10, y: 30, width: 80, font_size: 24, font_weight: 'bold', color: '#00BFA6', align: 'center' },
        { id: 'f2', type: 'company', x: 10, y: 50, width: 80, font_size: 13, font_weight: 'normal', color: '#94a3b8', align: 'center' },
        { id: 'f3', type: 'ticket', x: 10, y: 65, width: 80, font_size: 12, font_weight: 'normal', color: '#64748b', align: 'center' },
        { id: 'f4', type: 'qr_code', x: 37, y: 72, width: 26, font_size: 0, font_weight: 'normal', color: '#ffffff', align: 'center' },
      ],
    },
  },
  {
    name: 'Speaker Badge',
    paper_size: 'badge_4x3',
    template_json: {
      background: '#f8fafc',
      font_family: 'Inter',
      fields: [
        { id: 'f1', type: 'custom_text', value: 'SPEAKER', x: 10, y: 10, width: 80, font_size: 11, font_weight: 'bold', color: '#7c3aed', align: 'center' },
        { id: 'f2', type: 'name', x: 10, y: 28, width: 80, font_size: 26, font_weight: 'bold', color: '#0D1B2A', align: 'center' },
        { id: 'f3', type: 'company', x: 10, y: 52, width: 80, font_size: 13, font_weight: 'normal', color: '#64748b', align: 'center' },
        { id: 'f4', type: 'qr_code', x: 38, y: 65, width: 24, font_size: 0, font_weight: 'normal', color: '#000000', align: 'center' },
      ],
    },
  },
  {
    name: 'VIP Badge',
    paper_size: 'badge_4x3',
    template_json: {
      background: '#1e293b',
      font_family: 'Inter',
      fields: [
        { id: 'f1', type: 'custom_text', value: '★ VIP ★', x: 10, y: 8, width: 80, font_size: 13, font_weight: 'bold', color: '#f59e0b', align: 'center' },
        { id: 'f2', type: 'name', x: 10, y: 30, width: 80, font_size: 26, font_weight: 'bold', color: '#f8fafc', align: 'center' },
        { id: 'f3', type: 'ticket', x: 10, y: 55, width: 80, font_size: 13, font_weight: 'normal', color: '#94a3b8', align: 'center' },
        { id: 'f4', type: 'qr_code', x: 37, y: 68, width: 26, font_size: 0, font_weight: 'normal', color: '#f8fafc', align: 'center' },
      ],
    },
  },
  {
    name: 'Minimal QR',
    paper_size: 'badge_4x3',
    template_json: {
      background: '#ffffff',
      font_family: 'Inter',
      fields: [
        { id: 'f1', type: 'name', x: 5, y: 10, width: 90, font_size: 22, font_weight: 'bold', color: '#0D1B2A', align: 'center' },
        { id: 'f2', type: 'qr_code', x: 25, y: 30, width: 50, font_size: 0, font_weight: 'normal', color: '#000000', align: 'center' },
        { id: 'f3', type: 'email', x: 5, y: 83, width: 90, font_size: 11, font_weight: 'normal', color: '#94a3b8', align: 'center' },
      ],
    },
  },
]

export async function getBadgeTemplates(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data } = await supabase
    .from('badge_templates')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  return (data ?? []) as BadgeTemplate[]
}

export async function createBadgeTemplate(eventId: string, data: {
  name: string
  paper_size: string
  template_json: BadgeTemplate['template_json']
}) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const { data: created, error } = await supabase
    .from('badge_templates')
    .insert({ event_id: eventId, ...data })
    .select('*')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data: created as BadgeTemplate }
}

export async function updateBadgeTemplate(id: string, data: {
  name?: string
  paper_size?: string
  template_json?: BadgeTemplate['template_json']
  is_default?: boolean
}) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tmpl } = await supabase.from('badge_templates').select('event_id').eq('id', id).single()
  if (!tmpl) return { error: 'Template not found' }
  await assertCheckInAccess(supabase, user.id, (tmpl as any).event_id)

  const { error } = await supabase
    .from('badge_templates')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function deleteBadgeTemplate(id: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tmpl } = await supabase.from('badge_templates').select('event_id').eq('id', id).single()
  if (!tmpl) return { error: 'Template not found' }
  await assertCheckInAccess(supabase, user.id, (tmpl as any).event_id)

  const { error } = await supabase.from('badge_templates').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function seedPrebuiltTemplates(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertCheckInAccess(supabase, user.id, eventId)

  const rows = BADGE_TEMPLATES_PREBUILT.map(t => ({ event_id: eventId, ...t }))
  const { error } = await supabase.from('badge_templates').insert(rows)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true, count: rows.length }
}

export async function getAttendeeBadgeData(registrationId: string) {
  const supabase = await createClient()

  const { data } = await supabase
    .from('registrations')
    .select('attendee_name, attendee_email, qr_code, ticket_types(name), custom_field_values(field_id, value, registration_form_fields(label))')
    .eq('id', registrationId)
    .single()

  if (!data) return null
  const d = data as any
  return {
    name: d.attendee_name,
    email: d.attendee_email,
    qr_code: d.qr_code,
    ticket_name: d.ticket_types?.name ?? '',
    custom_fields: (d.custom_field_values ?? []).map((v: any) => ({
      label: v.registration_form_fields?.label ?? v.field_id,
      value: v.value,
    })),
  }
}
