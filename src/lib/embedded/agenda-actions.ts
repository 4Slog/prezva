'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { BUILTIN_SESSION_TYPES } from '@/lib/agenda/session-types'
import { z } from 'zod'
import type { Session, Track, Room, Speaker, OrgSessionType } from '@/lib/agenda/actions'

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

// ── Zod schemas ───────────────────────────────────────────────────────────────

const SessionSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  session_type: z.string().min(1).max(50).default('talk'),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  track_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  sponsored_by_id: z.string().uuid().nullable().optional(),
  capacity: z.number().int().nullable().optional(),
  is_published: z.boolean().default(true),
  recording_url: z.string().url().nullable().optional(),
  slides_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().default(0),
  ce_credit_hours: z.number().min(0).max(24).nullable().optional(),
  virtual_url: z.string().url().nullable().optional(),
  speaker_ids: z.array(z.string().uuid()).optional(),
  speaker_roles: z.record(z.string(), z.string()).optional(),
})

const TrackSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#3B82F6'),
  sort_order: z.number().int().default(0),
})

const RoomSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().nullable().optional(),
  location_hint: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
})

const OrgSessionTypeSchema = z.object({
  label: z.string().min(1).max(50),
  color: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
})

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ── Internal sessions query ───────────────────────────────────────────────────

async function _fetchSessions(
  db: ReturnType<typeof createAdminClient>,
  eventId: string,
): Promise<Session[]> {
  const { data } = await db
    .from('sessions')
    .select('*, tracks(id, name, color), rooms(id, name), session_speakers(role, speakers(id, name, job_title, company, photo_url)), sponsored_by:event_sponsors(id, name, logo_url, website_url)')
    .eq('event_id', eventId)
    .order('starts_at')
  return ((data ?? []) as any[]).map(s => ({
    ...s,
    track: s.tracks ?? null,
    room: s.rooms ?? null,
    speakers: (s.session_speakers ?? []).map((ss: any) =>
      ss.speakers ? { ...ss.speakers, session_role: ss.role ?? 'presenter' } : null
    ).filter(Boolean),
    sponsored_by: s.sponsored_by ?? null,
  }))
}

// ── Page data ─────────────────────────────────────────────────────────────────

export async function embedGetSessions(eventId: string): Promise<Session[]> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  return _fetchSessions(db, eventId)
}

export async function embedGetAgendaData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const [eventResult, sessions, tracksResult, roomsResult, speakersResult, typesResult] =
    await Promise.all([
      db.from('events').select('timezone').eq('id', eventId).single(),
      _fetchSessions(db, eventId),
      db.from('tracks').select('*').eq('event_id', eventId).order('sort_order'),
      db.from('rooms').select('*').eq('event_id', eventId).order('sort_order'),
      db.from('speakers').select('*').eq('event_id', eventId).order('sort_order'),
      db.from('org_session_types').select('*').eq('org_id', orgId).order('sort_order'),
    ])

  return {
    orgId,
    timezone: (eventResult.data as any)?.timezone ?? 'UTC',
    sessions,
    tracks: (tracksResult.data ?? []) as Track[],
    rooms: (roomsResult.data ?? []) as Room[],
    speakers: (speakersResult.data ?? []) as Speaker[],
    customTypes: (typesResult.data ?? []) as OrgSessionType[],
  }
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function embedCreateSession(eventId: string, input: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = SessionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  if (parsed.data.session_type) {
    const { data: customTypes } = await db
      .from('org_session_types').select('slug').eq('org_id', orgId)
    const validSlugs = new Set([
      ...(BUILTIN_SESSION_TYPES as readonly string[]),
      ...(customTypes ?? []).map((t: any) => t.slug),
    ])
    if (!validSlugs.has(parsed.data.session_type))
      return { error: `Unknown session type: ${parsed.data.session_type}` }
  }

  const { speaker_ids, speaker_roles, ...sessionData } = parsed.data
  const { data: session, error } = await db
    .from('sessions').insert({ event_id: eventId, ...sessionData }).select().single()
  if (error) return { error: error.message }

  if (speaker_ids?.length) {
    await db.from('session_speakers').insert(
      speaker_ids.map((sid, i) => ({
        session_id: (session as any).id,
        speaker_id: sid,
        sort_order: i,
        role: speaker_roles?.[sid] ?? 'presenter',
      }))
    )
  }
  return { data: session }
}

export async function embedUpdateSession(
  eventId: string,
  sessionId: string,
  input: unknown,
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = SessionSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  if (parsed.data.session_type) {
    const { data: customTypes } = await db
      .from('org_session_types').select('slug').eq('org_id', orgId)
    const validSlugs = new Set([
      ...(BUILTIN_SESSION_TYPES as readonly string[]),
      ...(customTypes ?? []).map((t: any) => t.slug),
    ])
    if (!validSlugs.has(parsed.data.session_type))
      return { error: `Unknown session type: ${parsed.data.session_type}` }
  }

  const { speaker_ids, speaker_roles, ...sessionData } = parsed.data as any
  const { data, error } = await db
    .from('sessions')
    .update(sessionData)
    .eq('id', sessionId)
    .eq('event_id', eventId)
    .select()
    .single()
  if (error) return { error: error.message }

  if (speaker_ids !== undefined) {
    await db.from('session_speakers').delete().eq('session_id', sessionId)
    if (speaker_ids.length) {
      await db.from('session_speakers').insert(
        speaker_ids.map((sid: string, i: number) => ({
          session_id: sessionId,
          speaker_id: sid,
          sort_order: i,
          role: speaker_roles?.[sid] ?? 'presenter',
        }))
      )
    }
  }
  return { data }
}

export async function embedDeleteSession(eventId: string, sessionId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('sessions').delete().eq('id', sessionId).eq('event_id', eventId)
  if (error) return { error: error.message }
  return { success: true }
}

// ── Rooms ─────────────────────────────────────────────────────────────────────

export async function embedCreateRoom(eventId: string, input: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = RoomSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('rooms').insert({ event_id: eventId, ...parsed.data }).select().single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedDeleteRoom(eventId: string, roomId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('rooms').delete().eq('id', roomId).eq('event_id', eventId)
  if (error) return { error: error.message }
  return { success: true }
}

// ── Tracks ────────────────────────────────────────────────────────────────────

export async function embedCreateTrack(eventId: string, input: unknown) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = TrackSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('tracks').insert({ event_id: eventId, ...parsed.data }).select().single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedUpdateTrack(
  eventId: string,
  trackId: string,
  input: unknown,
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const parsed = TrackSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { data, error } = await db
    .from('tracks')
    .update(parsed.data)
    .eq('id', trackId)
    .eq('event_id', eventId)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data }
}

export async function embedDeleteTrack(eventId: string, trackId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)
  const { error } = await db
    .from('tracks').delete().eq('id', trackId).eq('event_id', eventId)
  if (error) return { error: error.message }
  return { success: true }
}

// ── Org session types ─────────────────────────────────────────────────────────

export async function embedCreateOrgSessionType(orgId: string, input: unknown) {
  const { db, orgId: resolvedOrgId } = await resolveEmbedContext()
  if (orgId !== resolvedOrgId) return { error: 'Access denied' }
  const parsed = OrgSessionTypeSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const slug = slugify(parsed.data.label)
  if (!slug) return { error: 'Label produces an empty slug' }
  if ((BUILTIN_SESSION_TYPES as readonly string[]).includes(slug))
    return { error: `"${slug}" is a reserved built-in type` }
  const { data, error } = await db
    .from('org_session_types')
    .insert({ org_id: resolvedOrgId, slug, label: parsed.data.label, color: parsed.data.color ?? null, sort_order: parsed.data.sort_order ?? 0 })
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as OrgSessionType }
}

export async function embedUpdateOrgSessionType(
  orgId: string,
  typeId: string,
  input: unknown,
) {
  const { db, orgId: resolvedOrgId } = await resolveEmbedContext()
  if (orgId !== resolvedOrgId) return { error: 'Access denied' }
  const parsed = OrgSessionTypeSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const updates: Record<string, unknown> = {}
  if (parsed.data.label !== undefined) {
    const slug = slugify(parsed.data.label)
    if (!slug) return { error: 'Label produces an empty slug' }
    if ((BUILTIN_SESSION_TYPES as readonly string[]).includes(slug))
      return { error: `"${slug}" is a reserved built-in type` }
    updates.slug = slug
    updates.label = parsed.data.label
  }
  if (parsed.data.color !== undefined) updates.color = parsed.data.color
  if (parsed.data.sort_order !== undefined) updates.sort_order = parsed.data.sort_order
  const { data, error } = await db
    .from('org_session_types')
    .update(updates)
    .eq('id', typeId)
    .eq('org_id', resolvedOrgId)
    .select()
    .single()
  if (error) return { error: error.message }
  return { data: data as OrgSessionType }
}

export async function embedDeleteOrgSessionType(orgId: string, typeId: string) {
  const { db, orgId: resolvedOrgId } = await resolveEmbedContext()
  if (orgId !== resolvedOrgId) return { error: 'Access denied' }
  const { error } = await db
    .from('org_session_types').delete().eq('id', typeId).eq('org_id', resolvedOrgId)
  if (error) return { error: error.message }
  return { success: true }
}
