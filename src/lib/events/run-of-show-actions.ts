'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'
import { inputToInstant } from '@/lib/datetime/zoned-input'

type RosStatus = 'upcoming' | 'in_progress' | 'done' | 'skipped'
const ROS_STATUSES: readonly RosStatus[] = ['upcoming', 'in_progress', 'done', 'skipped']

export async function getRunOfShow(eventId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data } = await supabase
    .from('run_of_show_items')
    .select('*')
    .eq('event_id', eventId)
    .order('time_at', { ascending: true })
  return (data ?? []) as any[]
}

// O115: the permission is checked on the org of the event that owns the target —
// for an existing item that event comes from the item row, never from the caller.
type RosAuth = { error: string } | { eventId: string; timezone: string }

async function authorizeEvent(eventId: string): Promise<RosAuth> {
  const user = await requireUser()
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id, org_id, timezone').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Event not found' }
  try { await assertPermission(event.org_id as string, user.id, 'run_of_show.manage') } catch (e) { return catchPermission(e) }
  return { eventId: event.id as string, timezone: event.timezone as string }
}

async function authorizeItem(itemId: string): Promise<RosAuth> {
  await requireUser()
  const admin = createAdminClient()
  const { data: item } = await admin.from('run_of_show_items').select('id, event_id').eq('id', itemId).maybeSingle()
  if (!item) return { error: 'Item not found' }
  return authorizeEvent(item.event_id as string)
}

export async function upsertRosItem(eventId: string, item: {
  id?: string; time_at: string; duration_minutes: number; title: string;
  description?: string; responsible_person?: string; responsible_email?: string;
  sort_order?: number
}) {
  const { id, ...fields } = item
  const admin = createAdminClient()
  // O109: a datetime-local wall clock is read in the EVENT's zone; an instant
  // (Z / offset) passes through unchanged.
  const withInstant = (timezone: string) => {
    try { return { ok: true as const, values: { ...fields, time_at: inputToInstant(fields.time_at, timezone) } } }
    catch { return { ok: false as const } }
  }
  if (id) {
    const auth = await authorizeItem(id)
    if ('error' in auth) return auth
    const v = withInstant(auth.timezone)
    if (!v.ok) return { error: 'Invalid time' }
    // event_id is never rewritten on an existing row.
    const { data, error } = await admin.from('run_of_show_items')
      .update(v.values).eq('id', id).eq('event_id', auth.eventId).select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Item not found' }
  } else {
    const auth = await authorizeEvent(eventId)
    if ('error' in auth) return auth
    const v = withInstant(auth.timezone)
    if (!v.ok) return { error: 'Invalid time' }
    const { error } = await admin.from('run_of_show_items')
      .insert({ ...v.values, event_id: auth.eventId })
    if (error) return { error: error.message }
  }
  return { ok: true }
}

export async function updateRosItemStatus(itemId: string, status: RosStatus) {
  if (!ROS_STATUSES.includes(status)) return { error: 'Invalid status' }
  const auth = await authorizeItem(itemId)
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin.from('run_of_show_items')
    .update({ status }).eq('id', itemId).eq('event_id', auth.eventId).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found' }
  return { ok: true }
}

// MC hub (/mc/[token]) has no login: the MC token authorizes status changes
// only, and only on items of the token's own event.
export async function updateRosItemStatusByMcToken(token: string, itemId: string, status: RosStatus) {
  if (!token || !ROS_STATUSES.includes(status)) return { error: 'Invalid request' }
  const admin = createAdminClient()
  const { data: event } = await admin.from('events').select('id').eq('mc_token', token).maybeSingle()
  if (!event) return { error: 'Invalid MC link' }
  const { data, error } = await admin.from('run_of_show_items')
    .update({ status }).eq('id', itemId).eq('event_id', event.id as string).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found' }
  return { ok: true }
}

export async function deleteRosItem(itemId: string) {
  const auth = await authorizeItem(itemId)
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data, error } = await admin.from('run_of_show_items')
    .delete().eq('id', itemId).eq('event_id', auth.eventId).select('id')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Item not found' }
  return { ok: true }
}

export async function importSessionsToRos(eventId: string) {
  const auth = await authorizeEvent(eventId)
  if ('error' in auth) return auth
  const admin = createAdminClient()
  const { data: sessions } = await admin
    .from('sessions')
    .select('id, title, starts_at, ends_at, session_speakers(speakers(name))')
    .eq('event_id', auth.eventId)
    .order('starts_at', { ascending: true })
  if (!sessions?.length) return { error: 'No sessions found' }
  const items = (sessions as any[]).map((s, i) => {
    const start = new Date(s.starts_at)
    const end = new Date(s.ends_at ?? s.starts_at)
    const duration = Math.max(5, Math.round((end.getTime() - start.getTime()) / 60000))
    const firstSpeaker = s.session_speakers?.[0]?.speakers?.name
    return {
      event_id: auth.eventId,
      time_at: s.starts_at,
      duration_minutes: duration,
      title: s.title,
      responsible_person: firstSpeaker ?? null,
      sort_order: i,
    }
  })
  const { error } = await admin.from('run_of_show_items').insert(items)
  if (error) return { error: error.message }
  return { ok: true, count: items.length }
}
