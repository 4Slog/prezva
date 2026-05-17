'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { assertOrgRole } from '@/lib/orgs/actions'

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
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin', 'staff'])

  const admin = createAdminClient()
  const [locRes, visitRes, topRes] = await Promise.all([
    admin.from('passport_locations').select('id, name, code, points, created_at').eq('event_id', eventId).order('created_at'),
    admin.from('passport_visits').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    // Use a proper aggregate: count visits per user across ALL visits (not a 100-row sample)
    admin
      .from('passport_visits')
      .select('user_id, profiles(full_name)')
      .eq('event_id', eventId),
  ])

  // Aggregate all visits per user for accurate leaderboard
  const visitsByUser: Record<string, { userId: string; name: string; count: number }> = {}
  for (const v of (topRes.data ?? []) as any[]) {
    const uid = v.user_id
    if (!visitsByUser[uid]) visitsByUser[uid] = { userId: uid, name: (v as any).profiles?.full_name ?? 'Unknown', count: 0 }
    visitsByUser[uid].count++
  }
  const leaderboard = Object.values(visitsByUser).sort((a, b) => b.count - a.count).slice(0, 5)

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
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

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
  await assertOrgRole(supabase, orgId, user.id, ['owner', 'admin'])

  const admin = createAdminClient()
  const { error } = await admin
    .from('passport_locations')
    .delete()
    .eq('id', locationId)
    .eq('event_id', eventId)

  if (error) return { error: error.message }
  return { ok: true }
}
