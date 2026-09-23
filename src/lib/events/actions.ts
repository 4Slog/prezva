'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { logAudit } from '@/lib/audit/log'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { sendVolunteerThankYouEmails } from '@/lib/volunteers/actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCreateTimes, resolveUpdateTimes } from '@/lib/events/event-times'
import { inputToInstant } from '@/lib/datetime/zoned-input'

// ── Schemas ──────────────────────────────────────────────────────────────────

const CreateEventSchema = z.object({
  org_id:      z.string().uuid(),
  title:       z.string().min(2).max(120),
  slug:        z.string().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(5000).optional(),
  event_type:  z.enum(['in_person', 'virtual', 'hybrid']).default('in_person'),
  timezone:    z.string().min(1).optional(),
  // Wall clocks in the event's timezone (or zone-carrying instants); converted once
  // the timezone is resolved — see resolveCreateTimes.
  start_at:    z.string().min(1),
  end_at:      z.string().min(1),
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
})

// ── Settings sections ────────────────────────────────────────────────────────
// Each settings <form> owns a fixed set of columns. A section writes ALL of its
// columns: a blank text field clears it and an unchecked box turns it off. A
// section never touches another section's columns.

export type EventSettingsSection = 'general' | 'venue' | 'registration' | 'certificates'

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)
const checkbox = (fd: FormData, key: string) => fd.get(key) === 'true'

const GeneralSchema = z.object({
  title:       z.string().trim().min(2, 'Event name must be at least 2 characters').max(120),
  description: z.preprocess(blankToNull, z.string().max(5000).nullable()),
  timezone:    z.string().min(1, 'Timezone is required'),
  start_at:    z.string().min(1, 'Start is required'),
  end_at:      z.string().min(1, 'End is required'),
})

const VenueSchema = z.object({
  venue_name:    z.preprocess(blankToNull, z.string().max(120).nullable()),
  venue_address: z.preprocess(blankToNull, z.string().max(200).nullable()),
  venue_city:    z.preprocess(blankToNull, z.string().max(80).nullable()),
  venue_state:   z.preprocess(blankToNull, z.string().max(80).nullable()),
})

const RegistrationSchema = z.object({
  capacity: z.preprocess(blankToNull, z.coerce.number().int().min(1, 'Capacity must be at least 1').nullable()),
  waitlist_enabled:           z.boolean(),
  require_approval:           z.boolean(),
  allow_public_attendee_list: z.boolean(),
  // Compared case-insensitively at registration (src/lib/registration/actions.ts).
  registration_invite_code: z.preprocess(
    v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v),
    z.string().max(50, 'Invite code must be 50 characters or fewer')
      .regex(/^\S+$/, 'Invite code cannot contain spaces').nullable(),
  ),
  // Compared against the part after "@" of the registrant's email.
  registration_domain_restrict: z.preprocess(
    v => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().replace(/^@/, '').toLowerCase()) : v),
    z.string().max(100)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Enter a domain like acme.com')
      .nullable(),
  ),
})

const CertificatesSchema = z.object({
  certificate_enabled: z.boolean(),
  // Blank must not coerce to 0 (Number('') === 0): undefined → NaN → refused.
  certificate_min_session_attendance_pct: z.preprocess(
    v => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number({ message: 'Minimum attendance must be a number' })
      .int('Minimum attendance must be a whole number')
      .min(0, 'Minimum attendance must be between 0 and 100')
      .max(100, 'Minimum attendance must be between 0 and 100'),
  ),
  certificate_template_id: z.preprocess(blankToNull, z.string().uuid('Unknown certificate template').nullable()).optional(),
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

  // D5: the typed times are wall clocks in the event's timezone.
  const times = resolveCreateTimes(parsed.data.start_at, parsed.data.end_at, timezone)
  if ('error' in times) return { error: times.error }

  const { data: event, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, ...times, timezone, created_by: user.id })
    .select()
    .single()

  if (error || !event) return { error: error?.message ?? 'Failed to create event' }

  revalidatePath('/events')
  return { id: event.id, slug: event.slug }
}

// ── Update event ─────────────────────────────────────────────────────────────

export async function updateEvent(
  eventId: string,
  section: EventSettingsSection,
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()

  try {
    await assertEventAccess(supabase, eventId, user.id)
  } catch (e) {
    return { error: (e as Error).message }
  }

  const { data: stored } = await supabase
    .from('events')
    .select('org_id, start_at, end_at, timezone')
    .eq('id', eventId)
    .maybeSingle()
  if (!stored) return { error: 'Event not found' }

  let patch: Record<string, unknown>
  switch (section) {
    case 'general': {
      const parsed = GeneralSchema.safeParse({
        title:       formData.get('title') ?? undefined,
        description: formData.get('description') ?? '',
        timezone:    formData.get('timezone') ?? undefined,
        start_at:    formData.get('start_at') ?? undefined,
        end_at:      formData.get('end_at') ?? undefined,
      })
      if (!parsed.success) return { error: parsed.error.issues[0].message }
      const { start_at, end_at, timezone, ...rest } = parsed.data
      const times = resolveUpdateTimes({ start_at, end_at, timezone }, stored)
      if ('error' in times) return { error: times.error }
      patch = { ...rest, ...times }
      break
    }
    case 'venue': {
      const parsed = VenueSchema.safeParse({
        venue_name:    formData.get('venue_name') ?? '',
        venue_address: formData.get('venue_address') ?? '',
        venue_city:    formData.get('venue_city') ?? '',
        venue_state:   formData.get('venue_state') ?? '',
      })
      if (!parsed.success) return { error: parsed.error.issues[0].message }
      patch = parsed.data
      break
    }
    case 'registration': {
      const parsed = RegistrationSchema.safeParse({
        capacity:                     formData.get('capacity') ?? '',
        waitlist_enabled:             checkbox(formData, 'waitlist_enabled'),
        require_approval:             checkbox(formData, 'require_approval'),
        allow_public_attendee_list:   checkbox(formData, 'allow_public_attendee_list'),
        registration_invite_code:     formData.get('registration_invite_code') ?? '',
        registration_domain_restrict: formData.get('registration_domain_restrict') ?? '',
      })
      if (!parsed.success) return { error: parsed.error.issues[0].message }
      patch = parsed.data
      break
    }
    case 'certificates': {
      const parsed = CertificatesSchema.safeParse({
        certificate_enabled: checkbox(formData, 'certificate_enabled'),
        certificate_min_session_attendance_pct: formData.get('certificate_min_session_attendance_pct') ?? '',
        // The template picker is only rendered when the org has templates; absent = untouched.
        certificate_template_id: formData.has('certificate_template_id') ? formData.get('certificate_template_id') : undefined,
      })
      if (!parsed.success) return { error: parsed.error.issues[0].message }
      const { certificate_template_id, ...rest } = parsed.data
      patch = rest
      if (certificate_template_id !== undefined) {
        if (certificate_template_id !== null) {
          // certificate_templates is read through the admin client elsewhere
          // (listOrgCertificateTemplates); the template must be this event's org's.
          const { data: tpl } = await createAdminClient()
            .from('certificate_templates')
            .select('id')
            .eq('id', certificate_template_id)
            .eq('org_id', stored.org_id)
            .maybeSingle()
          if (!tpl) return { error: 'That certificate template does not belong to this organization.' }
        }
        patch.certificate_template_id = certificate_template_id
      }
      break
    }
    default:
      return { error: 'Unknown settings section' }
  }

  const { data: updated, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', eventId)
    .select('id')

  if (error) return { error: error.message }
  // A policy that filters the row out updates nothing without an error.
  if (!updated || updated.length === 0) return { error: 'Settings were not saved. You may not have permission to edit this event.' }

  revalidatePath('/events')
  revalidatePath('/events/[slug]', 'layout')
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
  startAt: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: event } = await supabase
    .from('events')
    .select('org_id, timezone')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return { error: 'Event not found' }
  // Same gate as createEvent: org owner or admin.
  try {
    await assertOrgMember(supabase, event.org_id, user.id)
  } catch {
    return { error: 'You must be an org owner or admin to apply a template' }
  }

  // The create form's wall clock, read in the event's timezone (D5).
  let start: string
  try {
    start = inputToInstant(startAt, event.timezone)
  } catch {
    return { error: 'Start is not a valid date and time.' }
  }

  const { applyStarterTemplate } = await import('@/lib/templates/apply-starter')
  await applyStarterTemplate(eventId, template, new Date(start))
  return { ok: true }
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
