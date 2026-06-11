'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { z } from 'zod'

// ── Embed context ─────────────────────────────────────────────────────────────

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

// ── Zod schema ────────────────────────────────────────────────────────────────

const SpeakerInputSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  job_title: z.string().max(255).nullable().optional(),
  company: z.string().max(255).nullable().optional(),
  bio: z.string().nullable().optional(),
  event_role: z.enum(['speaker', 'mc', 'chair', 'host', 'guest', 'vip']).default('speaker'),
})

// ── Page data ─────────────────────────────────────────────────────────────────

export async function embedGetSpeakersPageData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [eventResult, speakersResult] = await Promise.all([
    db.from('events').select('id, title, org_id, speaker_day_of_info').eq('id', eventId).single(),
    db
      .from('speakers')
      .select(
        'id, name, email, bio, photo_url, job_title, company, status, confirmed_at, confirmation_token, is_published, decline_reason, checked_in_at',
      )
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true }),
  ])

  return {
    event: eventResult.data as any,
    speakers: (speakersResult.data ?? []) as any[],
  }
}

// ── Roster ────────────────────────────────────────────────────────────────────

export async function embedGetSpeakers(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { data } = await db
    .from('speakers')
    .select(
      'id, name, email, bio, photo_url, job_title, company, status, confirmed_at, confirmation_token, is_published, decline_reason, checked_in_at',
    )
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })
  return (data ?? []) as any[]
}

export async function embedCreateSpeaker(eventId: string, input: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = SpeakerInputSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('speakers')
    .insert({
      event_id: eventId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      job_title: parsed.data.job_title ?? null,
      company: parsed.data.company ?? null,
      bio: parsed.data.bio ?? null,
      event_role: parsed.data.event_role,
      status: 'invited',
      sort_order: 0,
    })
    .select('id, name, email, status')
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedUpdateSpeaker(
  eventId: string,
  speakerId: string,
  patch: unknown,
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = SpeakerInputSchema.partial().safeParse(patch)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('speakers')
    .update(parsed.data)
    .eq('id', speakerId)
    .eq('event_id', eventId)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedDeleteSpeaker(eventId: string, speakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('speakers')
    .delete()
    .eq('id', speakerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  return { success: true }
}

export async function embedMarkSpeakerArrived(eventId: string, speakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('speakers')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('id', speakerId)
    .eq('event_id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

export async function embedUpdateSpeakerDayOfInfo(eventId: string, text: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('events')
    .update({ speaker_day_of_info: text || null })
    .eq('id', eventId)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Org speaker library ───────────────────────────────────────────────────────

export async function embedGetOrgSpeakerLibrary(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { data } = await db
    .from('org_speakers')
    .select('*')
    .eq('org_id', orgId)
    .order('times_spoken', { ascending: false })
  return (data ?? []) as any[]
}

export async function embedAddSpeakerFromLibrary(eventId: string, orgSpeakerId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  // Cross-org protection: verify the library row belongs to the resolved orgId
  const { data: libSpeaker } = await db
    .from('org_speakers')
    .select('*')
    .eq('id', orgSpeakerId)
    .eq('org_id', orgId)
    .single()
  if (!libSpeaker) return { error: 'Speaker not found in library' }

  if ((libSpeaker as any).email) {
    const { data: existing } = await db
      .from('speakers')
      .select('id')
      .eq('event_id', eventId)
      .eq('email', (libSpeaker as any).email)
      .maybeSingle()
    if (existing) return { error: 'Speaker is already added to this event' }
  }

  const { nanoid } = await import('nanoid')
  const token = nanoid(32)

  const { data: newSpeaker, error } = await db
    .from('speakers')
    .insert({
      event_id: eventId,
      name: (libSpeaker as any).name,
      email: (libSpeaker as any).email,
      job_title: (libSpeaker as any).job_title,
      company: (libSpeaker as any).company,
      bio: (libSpeaker as any).bio,
      photo_url: (libSpeaker as any).photo_url,
      website: (libSpeaker as any).website,
      linkedin_url: (libSpeaker as any).linkedin_url,
      twitter_handle: (libSpeaker as any).twitter_handle,
      status: 'invited',
      confirmation_token: token,
      sort_order: 0,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { ok: true, speakerId: (newSpeaker as any).id }
}
