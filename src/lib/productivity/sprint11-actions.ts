'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { requireEventTimezone, zonedInputToIso } from '@/lib/datetime/zoned-input'
import { resolveCreateTimes } from '@/lib/events/event-times'

// ── T-088: Agenda CSV import ──────────────────────────────────────────────────

export async function previewAgendaCsv(eventId: string, rows: Record<string, string>[], columnMap: Record<string, string>) {
  return rows.slice(0, 5).map(row => {
    const mapped: Record<string, string> = {}
    for (const [csvCol, field] of Object.entries(columnMap)) {
      if (row[csvCol] !== undefined) mapped[field] = row[csvCol]
    }
    return mapped
  })
}

// A time that names its zone is an instant and is kept: a trailing Z or offset, or a
// zone word the engine honours when parsing (UTC, GMT±hhmm, US abbreviations).
const HAS_ZONE = /(\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}(:?\d{2})?)$)|\b(UTC|GMT|[ECMP][SD]T)\b/i
const ISO_WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(:\d{2})?)$/
const pad2 = (n: number) => String(n).padStart(2, '0')

// D5: a CSV time with no zone is a wall clock in the EVENT's timezone, not the
// server's. Returns null for a value that isn't a date at all.
function csvTimeToIso(val: string, timeZone: string): string | null {
  try {
    return csvTimeToIsoOrThrow(val, timeZone)
  } catch {
    return null // e.g. 2026-02-30, which the zone helper rejects
  }
}

function csvTimeToIsoOrThrow(val: string, timeZone: string): string | null {
  if (HAS_ZONE.test(val)) {
    const ms = Date.parse(val)
    return Number.isNaN(ms) ? null : new Date(ms).toISOString()
  }
  const iso = ISO_WALL_CLOCK.exec(val)
  if (iso) return zonedInputToIso(`${iso[1]}T${iso[2]}`, timeZone)
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return zonedInputToIso(`${val}T00:00`, timeZone)
  // Other spellings ("9/23/2026 3:00 PM"): let the engine read the wall clock, then
  // take its fields back out. A zone-less string parses as server-local, so the
  // local getters return exactly the fields written, whatever the server's zone.
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return null
  const wall = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  return zonedInputToIso(wall, timeZone)
}

// The columns the agenda CSV mapper (SESSION_FIELDS in the agenda client) may write.
// track / room / speaker are offered by the mapper but not imported. Any other
// mapped name — event_id, is_published, … — is ignored.
const CSV_IMPORT_FIELDS = new Set(['title', 'description', 'starts_at', 'ends_at', 'session_type', 'capacity'])

export async function importAgendaFromCsv(eventId: string, rows: Record<string, string>[], columnMap: Record<string, string>) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase.from('events').select('org_id, timezone').eq('id', eventId).single()
  if (!event) return { imported: 0, error: 'Event not found' }
  try {
    await assertPermission((event as { org_id: string }).org_id, user.id, 'agenda.manage')
  } catch (e) {
    return { imported: 0, ...catchPermission(e) }
  }
  const timeZone = requireEventTimezone((event as { timezone?: unknown }).timezone)

  const badTimes: string[] = []
  const sessions = rows.map(row => {
    const mapped: Record<string, unknown> = {}
    for (const [csvCol, field] of Object.entries(columnMap)) {
      if (!CSV_IMPORT_FIELDS.has(field)) continue
      const val = row[csvCol]?.trim()
      if (!val) continue
      if (field === 'starts_at' || field === 'ends_at') {
        const iso = csvTimeToIso(val, timeZone)
        if (!iso) { badTimes.push(val); continue }
        mapped[field] = iso
      } else if (field === 'capacity') {
        mapped[field] = parseInt(val) || null
      } else {
        mapped[field] = val
      }
    }
    if (!mapped.title) return null
    if (!mapped.session_type) mapped.session_type = 'talk'
    // Always the argument's event, never a CSV value.
    return { ...mapped, event_id: eventId }
  }).filter(Boolean)

  if (badTimes.length > 0) return { imported: 0, error: `Unrecognised date/time: "${badTimes[0]}"` }
  if (sessions.length === 0) return { imported: 0, error: 'No valid sessions found' }

  const { data, error } = await supabase.from('sessions').insert(sessions as any[]).select('id')
  if (error) return { imported: 0, error: error.message }

  return { imported: data?.length ?? 0 }
}

// ── T-119: Clone event ────────────────────────────────────────────────────────

export async function cloneEvent(eventId: string, newTitle: string, newSlug: string) {
  const supabase = await createClient()

  const { data: sourceEvent } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()
  if (!sourceEvent) return { error: 'Event not found' }

  // Create new event
  const { data: newEvent, error: evError } = await supabase
    .from('events')
    .insert({
      org_id: (sourceEvent as any).org_id,
      title: newTitle,
      slug: newSlug,
      description: (sourceEvent as any).description,
      event_type: (sourceEvent as any).event_type,
      timezone: (sourceEvent as any).timezone,
      start_at: (sourceEvent as any).start_at,
      end_at: (sourceEvent as any).end_at,
      venue_name: (sourceEvent as any).venue_name,
      venue_address: (sourceEvent as any).venue_address,
      venue_city: (sourceEvent as any).venue_city,
      venue_state: (sourceEvent as any).venue_state,
      venue_country: (sourceEvent as any).venue_country,
      venue_zip: (sourceEvent as any).venue_zip,
      venue_map_url: (sourceEvent as any).venue_map_url,
      virtual_url: (sourceEvent as any).virtual_url,
      cover_image_url: (sourceEvent as any).cover_image_url,
      capacity: (sourceEvent as any).capacity,
      category: (sourceEvent as any).category,
      tags: (sourceEvent as any).tags ?? [],
      waitlist_enabled: (sourceEvent as any).waitlist_enabled ?? false,
      require_approval: (sourceEvent as any).require_approval ?? false,
      allow_public_attendee_list: (sourceEvent as any).allow_public_attendee_list ?? true,
      certificate_enabled: (sourceEvent as any).certificate_enabled ?? false,
      certificate_min_session_attendance_pct: (sourceEvent as any).certificate_min_session_attendance_pct ?? 60,
      speaker_form_schema: (sourceEvent as any).speaker_form_schema,
      pass_fees_to_registrant: (sourceEvent as any).pass_fees_to_registrant,
      ...((sourceEvent as any).leaderboard_point_config ? { leaderboard_point_config: (sourceEvent as any).leaderboard_point_config } : {}),
      parent_event_id: eventId,
      status: 'draft',
    })
    .select('id')
    .single()
  if (evError) return { error: evError.message }

  const newEventId = (newEvent as any).id

  // Clone ticket types
  const { data: tickets } = await supabase.from('ticket_types').select('*').eq('event_id', eventId)
  if ((tickets ?? []).length > 0) {
    await supabase.from('ticket_types').insert(
      (tickets as any[]).map(t => ({ ...t, id: undefined, event_id: newEventId, created_at: undefined }))
    )
  }

  // Clone speakers
  const { data: speakers } = await supabase.from('speakers').select('*').eq('event_id', eventId)
  if ((speakers ?? []).length > 0) {
    await supabase.from('speakers').insert(
      (speakers as any[]).map(s => ({ ...s, id: undefined, event_id: newEventId, created_at: undefined, updated_at: undefined, status: 'invited', confirmed_at: null, confirmation_token: undefined }))
    )
  }

  // Clone sessions (without speaker assignments to avoid FK issues)
  const { data: sessions } = await supabase.from('sessions').select('*').eq('event_id', eventId)
  if ((sessions ?? []).length > 0) {
    await supabase.from('sessions').insert(
      (sessions as any[]).map(s => ({ ...s, id: undefined, event_id: newEventId, created_at: undefined, updated_at: undefined }))
    )
  }

  return { id: newEventId, slug: newSlug }
}

// ── T-120: Event templates ────────────────────────────────────────────────────

export async function saveEventAsTemplate(eventId: string, name: string, description: string) {
  const supabase = await createClient()
  const user = await requireUser()

  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }

  // event_templates is service-role only; require org membership before writing.
  try { await assertPermission((event as any).org_id, user.id, 'org.templates.manage') } catch (e) { return catchPermission(e) }

  const { data: sessions } = await supabase.from('sessions').select('*').eq('event_id', eventId)
  const { data: tickets } = await supabase.from('ticket_types').select('*').eq('event_id', eventId)
  const { data: speakers } = await supabase.from('speakers').select('name, email, bio, job_title, company').eq('event_id', eventId)

  const ev = event as any
  const templateData = {
    event: {
      title: ev.title,
      description: ev.description,
      timezone: ev.timezone,
      speaker_form_schema: ev.speaker_form_schema,
      // dates captured ONLY to compute session offset on restore — new event uses user-entered dates
      start_at: ev.start_at,
      end_at: ev.end_at,
      event_type: ev.event_type,
      virtual_url: ev.virtual_url,
      capacity: ev.capacity,
      venue_name: ev.venue_name,
      venue_address: ev.venue_address,
      venue_city: ev.venue_city,
      venue_state: ev.venue_state,
      venue_country: ev.venue_country,
      venue_zip: ev.venue_zip,
      venue_map_url: ev.venue_map_url,
      cover_image_url: ev.cover_image_url,
      category: ev.category,
      tags: ev.tags,
      waitlist_enabled: ev.waitlist_enabled,
      require_approval: ev.require_approval,
      allow_public_attendee_list: ev.allow_public_attendee_list,
      certificate_enabled: ev.certificate_enabled,
      certificate_min_session_attendance_pct: ev.certificate_min_session_attendance_pct,
      leaderboard_point_config: ev.leaderboard_point_config,
      pass_fees_to_registrant: ev.pass_fees_to_registrant,
    },
    sessions: (sessions ?? []) as any[],
    tickets: (tickets ?? []) as any[],
    speakers: (speakers ?? []) as any[],
  }

  const admin = createAdminClient()
  const { error } = await admin.from('event_templates').insert({
    org_id: (event as any).org_id,
    name,
    description,
    template_data: templateData,
  })

  return { error: error?.message }
}

export async function getEventTemplates(orgId: string) {
  const user = await requireUser()
  await assertPermission(orgId, user.id, 'org.templates.view')

  const admin = createAdminClient()
  const { data } = await admin
    .from('event_templates')
    .select('id, name, description, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

export async function createEventFromTemplate(
  templateId: string,
  orgId: string,
  title: string,
  slug: string,
  startAt: string,
  endAt: string,
  formTimezone?: string,
) {
  const supabase = await createClient()
  const user = await requireUser()
  try { await assertPermission(orgId, user.id, 'event.manage') } catch (e) { return catchPermission(e) }

  const admin = createAdminClient()
  const { data: tpl } = await admin.from('event_templates').select('*').eq('id', templateId).single()
  if (!tpl) return { error: 'Template not found' }
  if ((tpl as any).org_id !== orgId) return { error: 'Template not found' }

  const td = (tpl as any).template_data
  const ev = td.event ?? {}

  // The create form's timezone wins, then the template row's, then the org's —
  // never a hardcoded literal.
  let timezone = formTimezone || (ev.timezone as string | undefined)
  if (!timezone) {
    const { data: org } = await admin.from('organizations').select('timezone').eq('id', orgId).maybeSingle()
    timezone = org?.timezone
  }
  if (!timezone) return { error: 'Could not determine a timezone for this event.' }

  // D5: the typed times are wall clocks in the event's timezone.
  const times = resolveCreateTimes(startAt, endAt, timezone)
  if ('error' in times) return { error: times.error }
  const startAtIso = times.start_at
  const endAtIso = times.end_at

  const { data: newEvent, error: evError } = await supabase.from('events').insert({
    created_by: user.id,
    org_id: orgId,
    title,
    slug,
    start_at: startAtIso,
    end_at: endAtIso,
    description: ev.description ?? null,
    timezone,
    event_type: ev.event_type ?? 'in_person',
    virtual_url: ev.virtual_url ?? null,
    capacity: ev.capacity ?? null,
    venue_name: ev.venue_name ?? null,
    venue_address: ev.venue_address ?? null,
    venue_city: ev.venue_city ?? null,
    venue_state: ev.venue_state ?? null,
    venue_country: ev.venue_country ?? 'US',
    venue_zip: ev.venue_zip ?? null,
    venue_map_url: ev.venue_map_url ?? null,
    cover_image_url: ev.cover_image_url ?? null,
    category: ev.category ?? null,
    tags: ev.tags ?? [],
    waitlist_enabled: ev.waitlist_enabled ?? false,
    require_approval: ev.require_approval ?? false,
    allow_public_attendee_list: ev.allow_public_attendee_list ?? true,
    certificate_enabled: ev.certificate_enabled ?? false,
    certificate_min_session_attendance_pct: ev.certificate_min_session_attendance_pct ?? 60,
    speaker_form_schema: ev.speaker_form_schema ?? [],
    pass_fees_to_registrant: ev.pass_fees_to_registrant ?? false,
    ...(ev.leaderboard_point_config ? { leaderboard_point_config: ev.leaderboard_point_config } : {}),
    status: 'draft',
  }).select('id').single()

  if (evError) return { error: evError.message }
  const newEventId = (newEvent as any).id

  // Date-shift sessions relative to the change in event start, preserving relative timing
  const oldStartMs = ev.start_at ? new Date(ev.start_at).getTime() : NaN
  const newStartMs = new Date(startAtIso).getTime()
  const delta = !isNaN(oldStartMs) && !isNaN(newStartMs) ? newStartMs - oldStartMs : 0
  const shift = (ts: string | null | undefined) =>
    ts ? new Date(new Date(ts).getTime() + delta).toISOString() : ts

  if (td.tickets?.length > 0) {
    const { error: ticketErr } = await supabase.from('ticket_types').insert(
      td.tickets.map((t: any) => ({
        event_id: newEventId,
        name: t.name,
        description: t.description ?? null,
        type: t.type ?? 'free',
        price_cents: t.price_cents ?? 0,
        currency: t.currency ?? 'usd',
        quantity: t.quantity ?? null,
        max_per_order: t.max_per_order ?? 10,
        sort_order: t.sort_order ?? 0,
        delivery_method: t.delivery_method ?? 'in_person',
        is_press: t.is_press ?? false,
        invite_only: t.invite_only ?? false,
        is_visible: t.is_visible ?? true,
        is_active: t.is_active ?? true,
        waitlist_enabled: t.waitlist_enabled ?? false,
        membership_required: t.membership_required ?? false,
        membership_provider: t.membership_provider ?? null,
        early_bird_price_cents: t.early_bird_price_cents ?? null,
        confirmation_email_subject: t.confirmation_email_subject ?? null,
        confirmation_email_body: t.confirmation_email_body ?? null,
        // intentionally NOT copied: id, created_at, updated_at, quantity_sold (runtime),
        // sale_starts_at/sale_ends_at/early_bird_ends_at (last cycle's absolute dates — organizer sets fresh)
      }))
    )
    if (ticketErr) return { error: `Tickets failed to copy: ${ticketErr.message}` }
  }

  if (td.sessions?.length > 0) {
    const { error: sessionErr } = await supabase.from('sessions').insert(
      td.sessions.map((s: any) => ({
        event_id: newEventId,
        title: s.title,
        description: s.description ?? null,
        session_type: s.session_type ?? 'talk',
        capacity: s.capacity ?? null,
        ce_credit_hours: s.ce_credit_hours ?? 0,
        tags: s.tags ?? [],
        sort_order: s.sort_order ?? 0,
        is_published: s.is_published ?? true,
        starts_at: shift(s.starts_at),
        ends_at: shift(s.ends_at),
        visible_from: shift(s.visible_from),
        visible_until: shift(s.visible_until),
        // intentionally NOT copied: id, created_at, updated_at, track_id/room_id/sponsored_by_id
        // (dangling FKs to old event), recording_url/slides_url/video_url (last event's media)
      }))
    )
    if (sessionErr) return { error: `Sessions failed to copy: ${sessionErr.message}` }
  }

  if (td.speakers?.length > 0) {
    const { error: speakerErr } = await supabase.from('speakers').insert(
      td.speakers.map((sp: any) => ({
        name: sp.name,
        email: sp.email,
        bio: sp.bio,
        job_title: sp.job_title,
        company: sp.company,
        event_id: newEventId,
      }))
    )
    if (speakerErr) return { error: `Speakers failed to copy: ${speakerErr.message}` }
  }

  return { id: newEventId, slug }
}

// ── T-121: Recurring event ────────────────────────────────────────────────────

export async function setEventRecurrence(eventId: string, recurrence: 'annual' | 'quarterly' | 'monthly' | null) {
  const supabase = await createClient()

  let nextOccurrenceDate: string | null = null
  if (recurrence) {
    const { data: event } = await supabase.from('events').select('end_at').eq('id', eventId).single()
    const endDate = new Date((event as any)?.end_at ?? new Date())
    const daysBeforeEnd = recurrence === 'annual' ? 90 : recurrence === 'quarterly' ? 30 : 7
    const triggerDate = new Date(endDate)
    triggerDate.setDate(triggerDate.getDate() - daysBeforeEnd)
    nextOccurrenceDate = triggerDate.toISOString().slice(0, 10)
  }

  const { error } = await supabase.from('events').update({
    recurrence: recurrence ?? null,
    next_occurrence_date: nextOccurrenceDate,
  }).eq('id', eventId)

  return { error: error?.message }
}

export async function createNextOccurrence(eventId: string) {
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single()
  if (!event) return { error: 'Event not found' }
  if (!(event as any).recurrence) return { error: 'Event is not recurring' }

  const recurrence = (event as any).recurrence
  const startAt = new Date((event as any).start_at)
  const endAt = new Date((event as any).end_at)
  const daysToAdd = recurrence === 'annual' ? 365 : recurrence === 'quarterly' ? 91 : 30

  const newStart = new Date(startAt)
  newStart.setDate(newStart.getDate() + daysToAdd)
  const newEnd = new Date(endAt)
  newEnd.setDate(newEnd.getDate() + daysToAdd)

  const nextYear = new Date().getFullYear() + 1
  const newSlug = `${(event as any).slug}-${recurrence === 'annual' ? nextYear : Date.now()}`
  const newTitle = `${(event as any).title} (${recurrence === 'annual' ? nextYear : new Date(newStart).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`

  const result = await cloneEvent(eventId, newTitle, newSlug)
  if (result.error) return result

  // Update dates on new event
  await supabase.from('events').update({
    start_at: newStart.toISOString(),
    end_at: newEnd.toISOString(),
    recurrence,
  }).eq('id', result.id)

  return { id: result.id, slug: result.slug }
}

// ── T-095: Badge template reuse ───────────────────────────────────────────────

export async function getOrgBadgeTemplates(orgId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('badge_templates')
    .select('id, name, paper_size, template_json')
    .eq('org_id', orgId)
    .eq('is_template', true)
  return (data ?? []) as any[]
}

export async function saveAsOrgTemplate(templateId: string, orgId: string) {
  const supabase = await createClient()
  const { data: tpl } = await supabase.from('badge_templates').select('*').eq('id', templateId).single()
  if (!tpl) return { error: 'Template not found' }
  const { error } = await supabase.from('badge_templates').insert({
    event_id: (tpl as any).event_id,
    org_id: orgId,
    name: `${(tpl as any).name} (Template)`,
    paper_size: (tpl as any).paper_size,
    template_json: (tpl as any).template_json,
    is_template: true,
  })
  return { error: error?.message }
}
