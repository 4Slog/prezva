'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/get-user'
import { isSuperAdmin } from '@/lib/admin/gate'

async function requireSuperAdmin() {
  const user = await requireUser()
  if (!isSuperAdmin(user.id)) throw new Error('Not authorized')
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

export async function sendPlatformAnnouncement(subject: string, message: string): Promise<{ sent: number }> {
  await requireSuperAdmin()
  const admin = createAdminClient()

  const { data: owners } = await admin
    .from('org_members')
    .select('user_id, profiles(email)')
    .eq('role', 'owner')

  const emails = new Set<string>()
  for (const o of (owners ?? []) as any[]) {
    const email = o.profiles?.email
    if (email) emails.add(email)
  }

  const emailList = [...emails]
  const batchSize = 50
  let sent = 0

  for (let i = 0; i < emailList.length; i += batchSize) {
    const batch = emailList.slice(i, i + batchSize)
    await Promise.all(batch.map(to =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Prezva <noreply@prezva.app>',
          to,
          subject,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:2rem">
              <div style="background:#2DD4BF;padding:1rem 1.5rem;border-radius:8px 8px 0 0">
                <h1 style="color:#0D1B2A;margin:0;font-size:1.25rem;font-weight:800">Prezva Platform Notice</h1>
              </div>
              <div style="background:#112240;padding:1.5rem;border-radius:0 0 8px 8px;border:1px solid #1E3A5F">
                <div style="color:#F0F4F8;font-size:1rem;line-height:1.6;white-space:pre-wrap">${message}</div>
                <hr style="border:none;border-top:1px solid #1E3A5F;margin:1.5rem 0" />
                <p style="color:#64748B;font-size:0.75rem;margin:0">
                  To manage your notification preferences, visit
                  <a href="https://prezva.app/settings" style="color:#2DD4BF">prezva.app/settings</a>
                </p>
              </div>
            </div>
          `,
        }),
      })
    ))
    sent += batch.length
    if (i + batchSize < emailList.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return { sent }
}
