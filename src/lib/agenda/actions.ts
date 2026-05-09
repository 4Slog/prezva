'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SessionType = 'talk' | 'workshop' | 'panel' | 'keynote' | 'break' | 'networking' | 'other'

export interface Track {
  id: string
  event_id: string
  name: string
  color: string
  sort_order: number
}

export interface Room {
  id: string
  event_id: string
  name: string
  capacity: number | null
  location_hint: string | null
  sort_order: number
}

export interface Speaker {
  id: string
  event_id: string
  name: string
  email: string | null
  bio: string | null
  photo_url: string | null
  job_title: string | null
  company: string | null
  sort_order: number
  is_published: boolean
}

export interface Session {
  id: string
  event_id: string
  track_id: string | null
  room_id: string | null
  title: string
  description: string | null
  session_type: SessionType
  starts_at: string
  ends_at: string
  capacity: number | null
  is_published: boolean
  recording_url: string | null
  slides_url: string | null
  sort_order: number
  speakers?: Pick<Speaker, 'id' | 'name' | 'job_title' | 'company' | 'photo_url'>[]
  track?: Pick<Track, 'id' | 'name' | 'color'> | null
  room?: Pick<Room, 'id' | 'name'> | null
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function assertOrgMember(
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
  return event
}

// ─── TRACKS ────────────────────────────────────────────────────────────────────

const TrackSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#3B82F6'),
  sort_order: z.number().int().default(0),
})

export async function getTracks(eventId: string): Promise<Track[]> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data } = await supabase
    .from('tracks').select('*').eq('event_id', eventId).order('sort_order')
  return (data ?? []) as Track[]
}

export async function createTrack(eventId: string, input: unknown) {
  const user = await requireUser()
  const parsed = TrackSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data, error } = await supabase
    .from('tracks').insert({ event_id: eventId, ...parsed.data }).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function updateTrack(eventId: string, trackId: string, input: unknown) {
  const user = await requireUser()
  const parsed = TrackSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data, error } = await supabase
    .from('tracks').update(parsed.data).eq('id', trackId).eq('event_id', eventId).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function deleteTrack(eventId: string, trackId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { error } = await supabase
    .from('tracks').delete().eq('id', trackId).eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ─── ROOMS ─────────────────────────────────────────────────────────────────────

const RoomSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().nullable().optional(),
  location_hint: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
})

export async function getRooms(eventId: string): Promise<Room[]> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data } = await supabase
    .from('rooms').select('*').eq('event_id', eventId).order('sort_order')
  return (data ?? []) as Room[]
}

export async function createRoom(eventId: string, input: unknown) {
  const user = await requireUser()
  const parsed = RoomSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data, error } = await supabase
    .from('rooms').insert({ event_id: eventId, ...parsed.data }).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function updateRoom(eventId: string, roomId: string, input: unknown) {
  const user = await requireUser()
  const parsed = RoomSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data, error } = await supabase
    .from('rooms').update(parsed.data).eq('id', roomId).eq('event_id', eventId).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function deleteRoom(eventId: string, roomId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { error } = await supabase
    .from('rooms').delete().eq('id', roomId).eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ─── SPEAKERS ──────────────────────────────────────────────────────────────────

const SpeakerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  bio: z.string().nullable().optional(),
  photo_url: z.string().url().nullable().optional(),
  job_title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  website: z.string().url().nullable().optional(),
  linkedin_url: z.string().url().nullable().optional(),
  twitter_handle: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  is_published: z.boolean().default(true),
})

export async function getSpeakers(eventId: string): Promise<Speaker[]> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data } = await supabase
    .from('speakers').select('*').eq('event_id', eventId).order('sort_order')
  return (data ?? []) as Speaker[]
}

export async function createSpeaker(eventId: string, input: unknown) {
  const user = await requireUser()
  const parsed = SpeakerSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data, error } = await supabase
    .from('speakers').insert({ event_id: eventId, ...parsed.data }).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function updateSpeaker(eventId: string, speakerId: string, input: unknown) {
  const user = await requireUser()
  const parsed = SpeakerSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data, error } = await supabase
    .from('speakers').update(parsed.data).eq('id', speakerId).eq('event_id', eventId).select().single()
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { data }
}

export async function deleteSpeaker(eventId: string, speakerId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { error } = await supabase
    .from('speakers').delete().eq('id', speakerId).eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

// ─── SESSIONS ──────────────────────────────────────────────────────────────────

const SessionSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  session_type: z.enum(['talk', 'workshop', 'panel', 'keynote', 'break', 'networking', 'other']).default('talk'),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  track_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  capacity: z.number().int().nullable().optional(),
  is_published: z.boolean().default(true),
  recording_url: z.string().url().nullable().optional(),
  slides_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().default(0),
  speaker_ids: z.array(z.string().uuid()).optional(),
})

export async function getSessions(eventId: string): Promise<Session[]> {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { data } = await supabase
    .from('sessions')
    .select('*, tracks(id, name, color), rooms(id, name), session_speakers(speakers(id, name, job_title, company, photo_url))')
    .eq('event_id', eventId)
    .order('starts_at')
  return ((data ?? []) as any[]).map(s => ({
    ...s,
    track: s.tracks ?? null,
    room: s.rooms ?? null,
    speakers: (s.session_speakers ?? []).map((ss: any) => ss.speakers).filter(Boolean),
  }))
}

export async function createSession(eventId: string, input: unknown) {
  const user = await requireUser()
  const parsed = SessionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const { speaker_ids, ...sessionData } = parsed.data
  const { data: session, error } = await supabase
    .from('sessions').insert({ event_id: eventId, ...sessionData }).select().single()
  if (error) return { error: error.message }

  if (speaker_ids?.length) {
    await supabase.from('session_speakers').insert(
      speaker_ids.map((sid, i) => ({ session_id: (session as any).id, speaker_id: sid, sort_order: i }))
    )
  }
  revalidatePath('/events')
  return { data: session }
}

export async function updateSession(eventId: string, sessionId: string, input: unknown) {
  const user = await requireUser()
  const parsed = SessionSchema.partial().safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const { speaker_ids, ...sessionData } = parsed.data as any
  const { data, error } = await supabase
    .from('sessions').update(sessionData).eq('id', sessionId).eq('event_id', eventId).select().single()
  if (error) return { error: error.message }

  if (speaker_ids !== undefined) {
    await supabase.from('session_speakers').delete().eq('session_id', sessionId)
    if (speaker_ids.length) {
      await supabase.from('session_speakers').insert(
        speaker_ids.map((sid: string, i: number) => ({ session_id: sessionId, speaker_id: sid, sort_order: i }))
      )
    }
  }
  revalidatePath('/events')
  return { data }
}

export async function deleteSession(eventId: string, sessionId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)
  const { error } = await supabase
    .from('sessions').delete().eq('id', sessionId).eq('event_id', eventId)
  if (error) return { error: error.message }
  revalidatePath('/events')
  return { success: true }
}

export async function getAgenda(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  await assertOrgMember(supabase, user.id, eventId)

  const [sessions, tracks, rooms, speakers] = await Promise.all([
    getSessions(eventId),
    getTracks(eventId),
    getRooms(eventId),
    getSpeakers(eventId),
  ])
  return { sessions, tracks, rooms, speakers }
}
