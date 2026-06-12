'use server'

import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyEmbeddedSession, COOKIE_NAME } from '@/lib/embedded/session'

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

// ── Actions ───────────────────────────────────────────────────────────────────

export async function embedGetRunOfShowData(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: event } = await db
    .from('events')
    .select('id, title, mc_token')
    .eq('id', eventId)
    .eq('org_id', orgId)
    .single()

  const { data: rosItems } = await db
    .from('run_of_show_items')
    .select('*')
    .eq('event_id', eventId)
    .order('time_at', { ascending: true })

  const { data: sessions } = await db
    .from('sessions')
    .select('id, title, starts_at, ends_at, session_speakers(speakers(name))')
    .eq('event_id', eventId)
    .order('starts_at', { ascending: true })

  return { event, rosItems: rosItems ?? [], sessions: sessions ?? [] }
}

export async function embedUpsertRosItem(
  eventId: string,
  item: {
    id?: string
    time_at: string
    duration_minutes: number
    title: string
    description?: string
    responsible_person?: string
    responsible_email?: string
    sort_order?: number
  },
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  if (item.id) {
    const { data: existing } = await db
      .from('run_of_show_items')
      .select('id, event_id')
      .eq('id', item.id)
      .maybeSingle()
    if (!existing || existing.event_id !== eventId) return { error: 'Item not found' }

    const { error } = await db
      .from('run_of_show_items')
      .update({ ...item, event_id: eventId })
      .eq('id', item.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await db
      .from('run_of_show_items')
      .insert({ ...item, event_id: eventId })
    if (error) return { error: error.message }
  }

  return { ok: true }
}

export async function embedUpdateRosItemStatus(
  eventId: string,
  itemId: string,
  status: 'upcoming' | 'in_progress' | 'done' | 'skipped',
) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: existing } = await db
    .from('run_of_show_items')
    .select('id, event_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!existing || existing.event_id !== eventId) return { error: 'Item not found' }

  await db.from('run_of_show_items').update({ status }).eq('id', itemId)
  return { ok: true }
}

export async function embedDeleteRosItem(eventId: string, itemId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: existing } = await db
    .from('run_of_show_items')
    .select('id, event_id')
    .eq('id', itemId)
    .maybeSingle()
  if (!existing || existing.event_id !== eventId) return { error: 'Item not found' }

  await db.from('run_of_show_items').delete().eq('id', itemId)
  return { ok: true }
}

export async function embedImportSessionsToRos(eventId: string) {
  const { db, orgId } = await resolveEmbedContext()
  await assertEventOwnership(db, eventId, orgId)

  const { data: sessions } = await db
    .from('sessions')
    .select('id, title, starts_at, ends_at, session_speakers(speakers(name))')
    .eq('event_id', eventId)
    .order('starts_at', { ascending: true })

  if (!sessions?.length) return { error: 'No sessions found' }

  const items = (sessions as any[]).map((s, i) => {
    const start = new Date(s.starts_at)
    const end = new Date(s.ends_at ?? s.starts_at)
    const duration = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000))
    const firstSpeaker = s.session_speakers?.[0]?.speakers?.name
    return {
      event_id: eventId,
      time_at: s.starts_at,
      duration_minutes: duration,
      title: s.title,
      responsible_person: firstSpeaker ?? null,
      sort_order: i,
    }
  })

  await db.from('run_of_show_items').insert(items)
  return { ok: true, count: items.length }
}
