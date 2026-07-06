'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'
import { catchPermission } from '@/lib/auth/permission-error'

async function getOrgId(supabase: any, eventId: string) {
  const { data: event } = await supabase.from('events').select('org_id').eq('id', eventId).maybeSingle()
  return event?.org_id as string | null
}

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars (0/O, 1/I)
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function getPassportAdmin(eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const orgId = await getOrgId(supabase, eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'passport.manage') } catch (e) { return catchPermission(e) }

  const admin = createAdminClient()
  const [locRes, visitRes, topRes] = await Promise.all([
    admin.from('passport_locations').select('id, name, code, points, created_at').eq('event_id', eventId).order('created_at'),
    admin.from('passport_visits').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    admin
      .from('passport_visits')
      .select('user_id, passport_locations(points)')
      .eq('event_id', eventId),
  ])

  const visits = (topRes.data ?? []) as any[]
  const userIds = [...new Set(visits.map(v => v.user_id).filter(Boolean))] as string[]

  const nameByUser: Record<string, string> = {}
  if (userIds.length > 0) {
    const [regRes, profRes] = await Promise.all([
      admin.from('registrations').select('user_id, attendee_name').eq('event_id', eventId).in('user_id', userIds),
      admin.from('profiles').select('id, full_name').in('id', userIds),
    ])
    for (const r of (regRes.data ?? []) as any[]) {
      if (r.user_id && r.attendee_name) nameByUser[r.user_id] = r.attendee_name
    }
    for (const p of (profRes.data ?? []) as any[]) {
      if (p.full_name) nameByUser[p.id] = p.full_name
    }
  }

  const byPerson: Record<string, { userId: string; name: string; count: number; totalPoints: number }> = {}
  for (const v of visits) {
    if (!v.user_id) continue
    const key = v.user_id as string
    const pts = (v as any).passport_locations?.points ?? 0
    if (!byPerson[key]) byPerson[key] = { userId: key, name: nameByUser[key] ?? 'Unknown', count: 0, totalPoints: 0 }
    byPerson[key].count++
    byPerson[key].totalPoints += pts
  }
  const leaderboard = Object.values(byPerson)
    .sort((a, b) => b.totalPoints - a.totalPoints || b.count - a.count)
    .slice(0, 10)

  return {
    locations: (locRes.data ?? []) as { id: string; name: string; code: string; points: number; created_at: string }[],
    totalStamps: visitRes.count ?? 0,
    leaderboard,
  }
}

export async function createPassportLocation(eventId: string, name: string, points: number) {
  const user = await requireUser()
  const supabase = await createClient()
  const orgId = await getOrgId(supabase, eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'passport.manage') } catch (e) { return catchPermission(e) }

  const admin = createAdminClient()
  const code = randomCode(6)
  const { data, error } = await admin
    .from('passport_locations')
    .insert({ event_id: eventId, name, code, points: Math.max(1, points) })
    .select()
    .single()

  if (error) return { error: error.message }
  return { data }
}

export async function deletePassportLocation(locationId: string, eventId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const orgId = await getOrgId(supabase, eventId)
  if (!orgId) return { error: 'Event not found' }
  try { await assertPermission(orgId, user.id, 'passport.manage') } catch (e) { return catchPermission(e) }

  const admin = createAdminClient()
  const { error } = await admin
    .from('passport_locations')
    .delete()
    .eq('id', locationId)
    .eq('event_id', eventId)

  if (error) return { error: error.message }
  return { ok: true }
}
