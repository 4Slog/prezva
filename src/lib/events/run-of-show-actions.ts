'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'

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

export async function upsertRosItem(eventId: string, item: {
  id?: string; time_at: string; duration_minutes: number; title: string;
  description?: string; responsible_person?: string; responsible_email?: string;
  sort_order?: number
}) {
  const supabase = await createClient()
  await requireUser()
  if (item.id) {
    const { error } = await supabase.from('run_of_show_items')
      .update({ ...item, event_id: eventId }).eq('id', item.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('run_of_show_items')
      .insert({ ...item, event_id: eventId })
    if (error) return { error: error.message }
  }
  return { ok: true }
}

export async function updateRosItemStatus(
  itemId: string,
  status: 'upcoming' | 'in_progress' | 'done' | 'skipped'
) {
  const supabase = await createClient()
  await requireUser()
  await supabase.from('run_of_show_items').update({ status }).eq('id', itemId)
  return { ok: true }
}

export async function deleteRosItem(itemId: string) {
  const supabase = await createClient()
  await requireUser()
  await supabase.from('run_of_show_items').delete().eq('id', itemId)
  return { ok: true }
}

export async function importSessionsToRos(eventId: string) {
  const supabase = await createClient()
  await requireUser()
  const { data: sessions } = await supabase
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
  const admin = createAdminClient()
  await admin.from('run_of_show_items').insert(items)
  return { ok: true, count: items.length }
}
