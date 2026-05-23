'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

async function requireSuperAdmin() {
  const supabase = await createClient()
  const user = await requireUser()
  const SUPER_ADMIN_IDS = (process.env.SUPER_ADMIN_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (!SUPER_ADMIN_IDS.includes(user.id)) {
    throw new Error('Not authorized')
  }
  return user
}

export interface PlatformStats {
  totalOrgs: number
  totalEvents: number
  totalRegistrations: number
  totalRevenueCents: number
  activeEvents: number
  publishedEvents: number
  newOrgsLast30d: number
  newRegsLast30d: number
  totalUsers: number
  avgRegsPerEvent: number
}

export async function getPlatformStats(): Promise<PlatformStats> {
  await requireSuperAdmin()
  const admin = createAdminClient()
  const now = new Date()
  const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [orgsRes, eventsRes, regsRes, revenueRes, activeRes, publishedRes, newOrgsRes, newRegsRes] = await Promise.all([
    admin.from('organizations').select('id', { count: 'exact', head: true }),
    admin.from('events').select('id', { count: 'exact', head: true }),
    admin.from('registrations').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'checked_in']),
    admin.from('registrations').select('amount_paid_cents').in('status', ['confirmed', 'checked_in']),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('status', 'live'),
    admin.from('events').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    admin.from('organizations').select('id', { count: 'exact', head: true }).gte('created_at', last30d),
    admin.from('registrations').select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'checked_in']).gte('created_at', last30d),
  ])

  const totalRevenue = ((revenueRes.data ?? []) as any[])
    .reduce((sum: number, r: any) => sum + (r.amount_paid_cents ?? 0), 0)
  const totalOrgs = orgsRes.count ?? 0
  const totalEvents = eventsRes.count ?? 0
  const totalRegs = regsRes.count ?? 0

  return {
    totalOrgs,
    totalEvents,
    totalRegistrations: totalRegs,
    totalRevenueCents: totalRevenue,
    activeEvents: activeRes.count ?? 0,
    publishedEvents: publishedRes.count ?? 0,
    newOrgsLast30d: newOrgsRes.count ?? 0,
    newRegsLast30d: newRegsRes.count ?? 0,
    totalUsers: 0,
    avgRegsPerEvent: totalEvents > 0 ? Math.round(totalRegs / totalEvents) : 0,
  }
}

export async function getRecentOrgs(limit = 10) {
  await requireSuperAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as any[]
}

export async function getRecentEvents(limit = 10) {
  await requireSuperAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('id, title, slug, status, start_at, registration_count, organizations(name)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as any[]
}
