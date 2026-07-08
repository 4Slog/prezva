'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { enqueueVolunteerInvite } from '@/lib/trigger'
import { z } from 'zod'

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

// ── Volunteers ────────────────────────────────────────────────────────────────

const AddVolunteerSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(['check-in', 'session-monitor', 'registration-desk', 'vip-support', 'general']),
  shift_start: z.string().optional(),
  shift_end: z.string().optional(),
  notes: z.string().optional(),
})

export async function embedGetVolunteers(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [volunteersResult, alertsResult, eventResult] = await Promise.all([
    db
      .from('volunteers')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
    db
      .from('volunteer_alerts')
      .select('id, volunteer_id, alert_type, message, resolved, created_at, volunteers(name)')
      .eq('event_id', eventId)
      .eq('resolved', false)
      .order('created_at', { ascending: false }),
    db.from('events').select('slug').eq('id', eventId).single(),
  ])

  return {
    volunteers: volunteersResult.data ?? [],
    alerts: alertsResult.data ?? [],
    eventSlug: (eventResult.data as any)?.slug ?? '',
  }
}

export async function embedAddVolunteer(eventId: string, payload: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const parsed = AddVolunteerSchema.safeParse(payload)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { data: event } = await db
    .from('events')
    .select('title, start_at')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }

  const { data: volunteer, error } = await db
    .from('volunteers')
    .insert({
      event_id:    eventId,
      name:        parsed.data.name,
      email:       parsed.data.email,
      phone:       parsed.data.phone ?? null,
      role:        parsed.data.role,
      shift_start: parsed.data.shift_start ?? null,
      shift_end:   parsed.data.shift_end ?? null,
      notes:       parsed.data.notes ?? null,
      status:      'invited',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'This email is already registered as a volunteer for this event' }
    }
    return { error: error.message }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'
  void enqueueVolunteerInvite({
    volunteerName:  volunteer.name,
    volunteerEmail: volunteer.email,
    volunteerRole:  volunteer.role,
    eventTitle:     (event as any).title,
    eventDate:      (event as any).start_at,
    shiftStart:     volunteer.shift_start ?? null,
    shiftEnd:       volunteer.shift_end ?? null,
    portalUrl:      `${appUrl}/volunteer/${volunteer.portal_access_token}`,
  })

  return { volunteer }
}

export async function embedCheckinVolunteer(volunteerId: string, eventId: string): Promise<{ ok: true } | { error: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('volunteers')
    .update({ status: 'checked_in', clocked_in_at: new Date().toISOString() })
    .eq('id', volunteerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function embedResendVolunteerInvite(volunteerId: string, eventId: string): Promise<{ ok: true } | { error: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: volunteer } = await db
    .from('volunteers')
    .select('*, events(title, start_at)')
    .eq('id', volunteerId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (!volunteer) return { error: 'Not found' }

  const event = volunteer.events as { title: string; start_at: string } | null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  void enqueueVolunteerInvite({
    volunteerName:  volunteer.name,
    volunteerEmail: volunteer.email,
    volunteerRole:  volunteer.role,
    eventTitle:     event?.title ?? '',
    eventDate:      event?.start_at ?? '',
    shiftStart:     volunteer.shift_start ?? null,
    shiftEnd:       volunteer.shift_end ?? null,
    portalUrl:      `${appUrl}/volunteer/${volunteer.portal_access_token}`,
  })

  return { ok: true }
}

export async function embedRemoveVolunteer(volunteerId: string, eventId: string): Promise<{ ok: true } | { error: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('volunteers')
    .delete()
    .eq('id', volunteerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function embedExportVolunteerHours(eventId: string): Promise<{ ok: true; csv: string; filename: string } | { error: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('title, timezone')
    .eq('id', eventId)
    .single()
  if (!event) return { error: 'Event not found' }

  const { data: volunteers } = await db
    .from('volunteers')
    .select('name, email, phone, role, shift_start, shift_end, clocked_in_at, clocked_out_at, status, notes')
    .eq('event_id', eventId)
    .order('name', { ascending: true })

  const rows = ((volunteers ?? []) as any[]).map(v => {
    const clockedIn = v.clocked_in_at ? new Date(v.clocked_in_at) : null
    const clockedOut = v.clocked_out_at ? new Date(v.clocked_out_at) : null
    const hoursWorked = clockedIn && clockedOut
      ? ((clockedOut.getTime() - clockedIn.getTime()) / 3600000).toFixed(2)
      : ''

    return [
      v.name ?? '',
      v.email ?? '',
      v.phone ?? '',
      v.role ?? '',
      v.status ?? '',
      v.shift_start ? new Date(v.shift_start).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      v.shift_end ? new Date(v.shift_end).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      v.clocked_in_at ? new Date(v.clocked_in_at).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      v.clocked_out_at ? new Date(v.clocked_out_at).toLocaleString('en-US', { timeZone: (event as any).timezone ?? 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
      hoursWorked,
      v.notes ?? '',
    ].map(cell => `"${String(cell).replace(/"/g, '""')}"`)
     .join(',')
  })

  const header = '"Name","Email","Phone","Role","Status","Shift Start","Shift End","Clocked In","Clocked Out","Hours Worked","Notes"'
  const csv = [header, ...rows].join('\n')

  return { ok: true, csv, filename: `volunteers-${(event as any).title?.toLowerCase().replace(/\s+/g, '-')}.csv` }
}
