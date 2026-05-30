/**
 * Stage 03 — Events + Tracks + Rooms
 *
 * For each event in data/events.json:
 *   1. Resolves created_by by querying org_members WHERE org_id = event.org_id AND role = 'owner'
 *      (execute only — dry-run reports intent without querying).
 *   2. Upserts the events row ON CONFLICT (id).
 *   3. Upserts tracks ON CONFLICT (id).
 *   4. Upserts rooms ON CONFLICT (id).
 *
 * events.slug has a UNIQUE constraint on (org_id, slug) — not globally unique.
 * Upsert is keyed by id, so slug conflicts across runs are safe.
 *
 * No INSERT triggers on events, tracks, or rooms — seed controls all inserts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventsFileData, EventDef } from '../lib/event-types'
import { log } from '../lib/logger'
import type { StageSummary } from '../lib/logger'

/** Resolve the owner's profiles.id for an org (used as created_by). */
async function resolveOrgOwner(supabase: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()
  if (error) {
    log.warn(`Could not resolve owner for org ${orgId}: ${error.message}`)
    return null
  }
  return (data?.user_id as string) ?? null
}

async function upsertEvent(
  supabase: SupabaseClient,
  event: EventDef,
  createdBy: string,
): Promise<void> {
  const { error } = await supabase.from('events').upsert(
    {
      id:                                  event.id,
      org_id:                              event.org_id,
      created_by:                          createdBy,
      title:                               event.title,
      slug:                                event.slug,
      status:                              event.status,
      event_type:                          event.event_type,
      timezone:                            event.timezone,
      is_discoverable:                     event.is_discoverable,
      start_at:                            event.start_at,
      end_at:                              event.end_at,
      description:                         event.description      ?? null,
      venue_name:                          event.venue_name        ?? null,
      venue_city:                          event.venue_city        ?? null,
      venue_state:                         event.venue_state       ?? null,
      virtual_url:                         event.virtual_url       ?? null,
      capacity:                            event.capacity          ?? null,
      certificate_enabled:                 event.certificate_enabled ?? false,
      certificate_min_session_attendance_pct:
        event.certificate_min_session_attendance_pct ?? 60,
    },
    { onConflict: 'id' },
  )
  if (error) throw new Error(`upsert event "${event.title}": ${error.message}`)
}

async function upsertTracks(supabase: SupabaseClient, event: EventDef): Promise<number> {
  const tracks = event.tracks ?? []
  if (!tracks.length) return 0
  const { error } = await supabase.from('tracks').upsert(
    tracks.map(t => ({
      id:         t.id,
      event_id:   event.id,
      name:       t.name,
      color:      t.color       ?? '#3B82F6',
      sort_order: t.sort_order  ?? 0,
    })),
    { onConflict: 'id' },
  )
  if (error) throw new Error(`upsert tracks for "${event.title}": ${error.message}`)
  return tracks.length
}

async function upsertRooms(supabase: SupabaseClient, event: EventDef): Promise<number> {
  const rooms = event.rooms ?? []
  if (!rooms.length) return 0
  const { error } = await supabase.from('rooms').upsert(
    rooms.map(r => ({
      id:             r.id,
      event_id:       event.id,
      name:           r.name,
      capacity:       r.capacity       ?? null,
      location_hint:  r.location_hint  ?? null,
      sort_order:     r.sort_order     ?? 0,
    })),
    { onConflict: 'id' },
  )
  if (error) throw new Error(`upsert rooms for "${event.title}": ${error.message}`)
  return rooms.length
}

export async function runEvents(
  supabase: SupabaseClient,
  data: EventsFileData,
  opts: { dryRun: boolean },
): Promise<StageSummary> {
  log.section('Stage 03: Events + Tracks + Rooms')

  const totalEvents = data.events.length
  const totalTracks = data.events.reduce((s, e) => s + (e.tracks?.length ?? 0), 0)
  const totalRooms  = data.events.reduce((s, e) => s + (e.rooms?.length  ?? 0), 0)
  const totalPlanned = totalEvents + totalTracks + totalRooms

  log.info(`Plan: ${totalEvents} events, ${totalTracks} tracks, ${totalRooms} rooms`)

  if (opts.dryRun) {
    for (const event of data.events) {
      const tracks = event.tracks?.length ?? 0
      const rooms  = event.rooms?.length  ?? 0
      log.dry(
        `upsert event "${event.title}" (${event.status}) — org ${event.org_id.slice(0, 8)}…\n` +
        `         created_by: would resolve from org owner\n` +
        `         tracks: ${tracks}, rooms: ${rooms}`,
      )
    }
    log.info('')
    log.ok('Dry-run complete — no writes made')
    return { stage: 'events', planned: totalPlanned, actual: 0, note: 'dry-run' }
  }

  let actualEvents = 0
  let actualTracks = 0
  let actualRooms  = 0

  for (const event of data.events) {
    const createdBy = await resolveOrgOwner(supabase, event.org_id)
    if (!createdBy) throw new Error(`No owner found for org ${event.org_id} — run stage 02 first`)

    await upsertEvent(supabase, event, createdBy)
    actualEvents++

    const tc = await upsertTracks(supabase, event)
    actualTracks += tc

    const rc = await upsertRooms(supabase, event)
    actualRooms += rc

    log.ok(`${event.title} (${event.status}) — ${tc} track(s), ${rc} room(s)`)
  }

  const actual = actualEvents + actualTracks + actualRooms
  log.ok(`Stage 03 complete — ${actualEvents} events, ${actualTracks} tracks, ${actualRooms} rooms`)
  return { stage: 'events', planned: totalPlanned, actual }
}
