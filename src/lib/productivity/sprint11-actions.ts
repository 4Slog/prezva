'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

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

export async function importAgendaFromCsv(eventId: string, rows: Record<string, string>[], columnMap: Record<string, string>) {
  const supabase = await createClient()

  const sessions = rows.map(row => {
    const mapped: Record<string, unknown> = { event_id: eventId }
    for (const [csvCol, field] of Object.entries(columnMap)) {
      const val = row[csvCol]?.trim()
      if (!val) continue
      if (field === 'starts_at' || field === 'ends_at') {
        mapped[field] = new Date(val).toISOString()
      } else if (field === 'capacity') {
        mapped[field] = parseInt(val) || null
      } else if (field !== 'speaker' && field !== 'track' && field !== 'room') {
        mapped[field] = val
      }
    }
    if (!mapped.title) return null
    if (!mapped.session_type) mapped.session_type = 'talk'
    return mapped
  }).filter(Boolean)

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
      virtual_url: (sourceEvent as any).virtual_url,
      cover_image_url: (sourceEvent as any).cover_image_url,
      speaker_form_schema: (sourceEvent as any).speaker_form_schema,
      pass_fees_to_registrant: (sourceEvent as any).pass_fees_to_registrant,
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
  await assertOrgRole(supabase, (event as any).org_id, user.id, ['owner', 'admin'])

  const { data: sessions } = await supabase.from('sessions').select('*').eq('event_id', eventId)
  const { data: tickets } = await supabase.from('ticket_types').select('*').eq('event_id', eventId)
  const { data: speakers } = await supabase.from('speakers').select('name, email, bio, job_title, company').eq('event_id', eventId)

  const templateData = {
    event: { title: (event as any).title, description: (event as any).description, timezone: (event as any).timezone, speaker_form_schema: (event as any).speaker_form_schema },
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
  const supabase = await createClient()
  const user = await requireUser()
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

  const admin = createAdminClient()
  const { data } = await admin
    .from('event_templates')
    .select('id, name, description, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return (data ?? []) as any[]
}

export async function createEventFromTemplate(templateId: string, orgId: string, title: string, slug: string) {
  const supabase = await createClient()
  const user = await requireUser()
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const admin = createAdminClient()
  const { data: tpl } = await admin.from('event_templates').select('*').eq('id', templateId).single()
  if (!tpl) return { error: 'Template not found' }
  if ((tpl as any).org_id !== orgId) return { error: 'Template not found' }

  const td = (tpl as any).template_data
  const { data: newEvent, error: evError } = await supabase.from('events').insert({
    org_id: orgId,
    title,
    slug,
    description: td.event?.description,
    timezone: td.event?.timezone ?? 'America/New_York',
    speaker_form_schema: td.event?.speaker_form_schema ?? [],
    status: 'draft',
  }).select('id').single()

  if (evError) return { error: evError.message }
  const newEventId = (newEvent as any).id

  if (td.tickets?.length > 0) {
    await supabase.from('ticket_types').insert(
      td.tickets.map((t: any) => ({ ...t, id: undefined, event_id: newEventId, created_at: undefined }))
    )
  }
  if (td.sessions?.length > 0) {
    await supabase.from('sessions').insert(
      td.sessions.map((s: any) => ({ ...s, id: undefined, event_id: newEventId, created_at: undefined, updated_at: undefined }))
    )
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
