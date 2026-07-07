'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'
import { getLeaderboard } from '@/lib/engagement/sprint10-actions'
import { POINT_VALUES } from '@/lib/engagement/point-values'

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

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function embedGetLeaderboardData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('leaderboard_point_config, slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  const leaders = await getLeaderboard(eventId)

  const nameMap: Record<string, string> = {}
  if (leaders.length > 0) {
    const { data: regs } = await db
      .from('registrations')
      .select('user_id, attendee_name, attendee_email')
      .eq('event_id', eventId)
      .in('user_id', leaders.map(l => l.userId))
    for (const r of (regs ?? []) as any[]) {
      nameMap[r.user_id] = r.attendee_name ?? r.attendee_email ?? 'Attendee'
    }
  }

  const dbConfig = ((event as any)?.leaderboard_point_config ?? {}) as Record<string, number>
  const mergedConfig: Record<string, number> = { ...POINT_VALUES, ...dbConfig }

  return { eventSlug: (event as any)?.slug as string, leaders, nameMap, mergedConfig }
}

export async function embedUpdateLeaderboardPointConfig(
  eventId: string,
  config: Record<string, number>,
): Promise<{ ok?: boolean; error?: string }> {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { error } = await db
    .from('events')
    .update({ leaderboard_point_config: config })
    .eq('id', eventId)
    .eq('org_id', orgId)
  if (error) return { error: error.message }
  return { ok: true }
}

// ── Photos ────────────────────────────────────────────────────────────────────

export async function embedGetPhotosData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { count } = await db
    .from('photo_contest_entries')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', eventId)

  const { data: event } = await db
    .from('events')
    .select('slug')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  return { count: count ?? 0, eventSlug: (event as any)?.slug as string }
}
