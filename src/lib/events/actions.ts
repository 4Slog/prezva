'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sendVolunteerThankYouEmails } from '@/lib/volunteers/actions'

// ── Schemas ──────────────────────────────────────────────────────────────────

const CreateEventSchema = z.object({
  org_id:      z.string().uuid(),
  title:       z.string().min(2).max(120),
  slug:        z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(5000).optional(),
  event_type:  z.enum(['in_person', 'virtual', 'hybrid']).default('in_person'),
  timezone:    z.string().min(1).optional(),
  start_at:    z.string().min(1).transform(v => v.includes("Z") || v.includes("+") ? v : new Date(v).toISOString()),
  end_at:      z.string().min(1).transform(v => v.includes("Z") || v.includes("+") ? v : new Date(v).toISOString()),
  // venue
  venue_name:    z.string().max(120).optional(),
  venue_address: z.string().max(200).optional(),
  venue_city:    z.string().max(80).optional(),
  venue_state:   z.string().max(80).optional(),
  // virtual
  virtual_url: z.string().url().optional().or(z.literal('')),
  // capacity
  capacity:         z.coerce.number().int().min(1).optional(),
  waitlist_enabled: z.coerce.boolean().default(false),
}).refine(d => new Date(d.end_at) > new Date(d.start_at), {
  message: 'End time must be after start time',
  path: ['end_at'],
})

const UpdateEventSchema = z.object({
  title:       z.string().min(2).max(120).optional(),
  description: z.string().max(5000).optional(),
  event_type:  z.enum(['in_person', 'virtual', 'hybrid']).optional(),
  timezone:    z.string().min(1).optional(),
  start_at:    z.string().datetime().optional(),
  end_at:      z.string().datetime().optional(),
  venue_name:    z.string().max(120).optional(),
  venue_address: z.string().max(200).optional(),
  venue_city:    z.string().max(80).optional(),
  venue_state:   z.string().max(80).optional(),
  virtual_url:   z.string().url().optional().or(z.literal('')),
  capacity:         z.coerce.number().int().min(1).optional(),
  waitlist_enabled: z.coerce.boolean().optional(),
  allow_public_attendee_list: z.coerce.boolean().optional(),
  require_approval:           z.coerce.boolean().optional(),
  cover_image_url: z.string().url().optional().or(z.literal('')),
  is_discoverable: z.coerce.boolean().optional(),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

async function assertOrgMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  roles: ('owner' | 'admin' | 'staff')[] = ['owner', 'admin'],
) {
  const { data } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data || !roles.includes(data.role as 'owner' | 'admin' | 'staff')) {
    throw new Error('Insufficient permissions')
  }
  return data.role as 'owner' | 'admin' | 'staff'
}

async function assertEventAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  userId: string,
  roles: ('owner' | 'admin' | 'staff')[] = ['owner', 'admin'],
) {
  const { data: event } = await supabase
    .from('events')
    .select('org_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) throw new Error('Event not found')
  return assertOrgMember(supabase, event.org_id, userId, roles)
}

// ── Create event ─────────────────────────────────────────────────────────────

export async function createEvent(formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  const raw = {
    org_id:      formData.get('org_id'),
    title:       formData.get('title'),
    slug:        formData.get('slug'),
    description: formData.get('description') || undefined,
    event_type:  formData.get('event_type') || 'in_person',
    timezone:    formData.get('timezone') || undefined,
    start_at:    formData.get('start_at'),
    end_at:      formData.get('end_at'),
    venue_name:    formData.get('venue_name') || undefined,
    venue_address: formData.get('venue_address') || undefined,
    venue_city:    formData.get('venue_city') || undefined,
    venue_state:   formData.get('venue_state') || undefined,
    virtual_url:   formData.get('virtual_url') || undefined,
    capacity:         formData.get('capacity') || undefined,
    waitlist_enabled: formData.get('waitlist_enabled') === 'true',
  }

  const parsed = CreateEventSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Must be org owner or admin
  try {
    await assertOrgMember(supabase, parsed.data.org_id, user.id)
  } catch {
    return { error: 'You must be an org owner or admin to create events' }
  }

  // Slug must be unique within org
  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('org_id', parsed.data.org_id)
    .eq('slug', parsed.data.slug)
    .maybeSingle()
  if (existing) return { error: 'An event with that slug already exists in this organization' }

  // Explicit submitted value always wins; otherwise derive from the org.
  let timezone = parsed.data.timezone
  if (!timezone) {
    const { data: org } = await supabase
      .from('organizations')
      .select('timezone')
      .eq('id', parsed.data.org_id)
      .maybeSingle()
    timezone = org?.timezone
  }
  if (!timezone) return { error: 'Could not determine a timezone for this event.' }

  const { data: event, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, timezone, created_by: user.id })
    .select()
    .single()

  if (error || !event) return { error: error?.message ?? 'Failed to create event' }

  revalidatePath('/events')
  return { id: event.id, slug: event.slug }
}

// ── Update event ─────────────────────────────────────────────────────────────

export async function updateEvent(eventId: string, formData: FormData) {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    await assertEventAccess(supabase, eventId, user.id)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const raw: Record<string, unknown> = {}
  for (const key of UpdateEventSchema.keyof().options) {
    const val = formData.get(key)
    if (val !== null && val !== '') raw[key] = val
  }

  const parsed = UpdateEventSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase
    .from('events')
    .update(parsed.data)
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath('/events')
  revalidatePath(`/events/[slug]`)
  return { success: true }
}

export async function updateEventDiscoverable(eventId: string, isDiscoverable: boolean) {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    await assertEventAccess(supabase, eventId, user.id)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await supabase
    .from('events')
    .update({ is_discoverable: isDiscoverable })
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath('/events')
  revalidatePath(`/events/[slug]`)
  return { success: true }
}

// ── Transition event status ───────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:     ['published', 'cancelled'],
  published: ['live', 'cancelled'],
  live:      ['ended'],
  ended:     ['archived'],
  cancelled: [],
  archived:  [],
}

export async function transitionEventStatus(
  eventId: string,
  newStatus: string,
) {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    await assertEventAccess(supabase, eventId, user.id)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return { error: 'Event not found' }

  const allowed = VALID_TRANSITIONS[event.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { error: `Cannot transition from '${event.status}' to '${newStatus}'` }
  }

  const { error } = await supabase
    .from('events')
    .update({ status: newStatus })
    .eq('id', eventId)

  if (error) return { error: error.message }

  if (newStatus === 'published' || newStatus === 'cancelled') {
    await logAudit(supabase, null, user.id, `event.${newStatus}`, 'event', eventId, { previousStatus: event.status })
  }

  if (newStatus === 'ended') {
    sendVolunteerThankYouEmails(eventId).catch(() => {})
  }

  revalidatePath('/events')
  revalidatePath(`/events/[slug]`)
  return { success: true }
}

// ── Get event by slug (with org membership check) ────────────────────────────

export async function getEventBySlug(slug: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select(`
      *,
      organizations!inner(id, name, slug, org_members!inner(user_id, role))
    `)
    .eq('slug', slug)
    .eq('organizations.org_members.user_id', user.id)
    .maybeSingle()

  return event
}

// ── List org events ───────────────────────────────────────────────────────────

export async function getOrgEvents(orgId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  // Verify membership
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!member) return []

  const { data, error } = await supabase
    .from('events')
    .select('id, title, slug, status, event_type, start_at, end_at, registration_count, checked_in_count, venue_city, venue_state')
    .eq('org_id', orgId)
    .order('start_at', { ascending: false })

  if (error) return []
  return data
}

// ── Delete event (owner only, draft/cancelled only) ───────────────────────────

export async function deleteEvent(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('org_id, status')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return { error: 'Event not found' }

  try {
    await assertOrgMember(supabase, event.org_id, user.id, ['owner'])
  } catch {
    return { error: 'Only org owners can delete events' }
  }

  if (!['draft', 'cancelled'].includes(event.status)) {
    return { error: 'Only draft or cancelled events can be deleted' }
  }

  const { error } = await supabase.from('events').delete().eq('id', eventId)
  if (error) return { error: error.message }

  revalidatePath('/events')
  return { success: true }
}

// ── Apply starter template (server action wrapper) ───────────────────────────

export async function applyStarterAction(
  eventId: string,
  template: import('@/lib/templates/types').EventTemplate,
  startAtIso: string,
) {
  const { applyStarterTemplate } = await import('@/lib/templates/apply-starter')
  await applyStarterTemplate(eventId, template, new Date(startAtIso))
}

// ── Badge rules ───────────────────────────────────────────────────────────────

export async function updateBadgeRules(eventId: string, rules: unknown[]) {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    await assertEventAccess(supabase, eventId, user.id)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await supabase
    .from('events')
    .update({ badge_rules: rules })
    .eq('id', eventId)

  if (error) return { error: error.message }
  revalidatePath(`/events/[slug]/badges`, 'page')
  return { ok: true }
}

// ── Tags and category ─────────────────────────────────────────────────────────

export async function updateEventTagsAndCategory(
  eventId: string,
  category: string | null,
  tags: string[],
) {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    await assertEventAccess(supabase, eventId, user.id)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { error } = await supabase
    .from('events')
    .update({ category: category || null, tags })
    .eq('id', eventId)

  if (error) return { error: error.message }
  revalidatePath(`/events/[slug]/settings`, 'page')
  return { ok: true }
}
