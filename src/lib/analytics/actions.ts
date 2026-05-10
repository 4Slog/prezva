'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/auth/get-user'

export interface EventAnalytics {
  totalRegistrations: number
  confirmedRegistrations: number
  checkedIn: number
  checkInRate: number
  totalRevenueCents: number
  capacity: number | null
  capacityUsed: number
  surveyResponseCount: number
  registrationsByDay: { date: string; count: number }[]
  ticketBreakdown: { type: string; count: number; revenueCents: number }[]
  announcementCount: number
}

export async function getEventAnalytics(eventId: string): Promise<EventAnalytics> {
  const supabase = await createClient()
  await requireUser()

  const [
    { data: event },
    { data: registrations },
    { data: checkins },
    { data: surveyResponses },
    { data: announcements },
    { data: ticketTypes },
  ] = await Promise.all([
    supabase.from('events').select('capacity, registration_count, checked_in_count').eq('id', eventId).single(),
    supabase.from('registrations').select('status, amount_paid_cents, ticket_type_id, created_at').eq('event_id', eventId),
    supabase.from('check_ins').select('id').eq('event_id', eventId),
    supabase.from('survey_responses').select('id, surveys!inner(event_id)').eq('surveys.event_id', eventId),
    supabase.from('announcements').select('id').eq('event_id', eventId),
    supabase.from('ticket_types').select('id, name, type').eq('event_id', eventId),
  ])

  const regs = registrations ?? []
  const confirmed = regs.filter((r: any) => r.status === 'confirmed')
  const totalRevenue = confirmed.reduce((sum: number, r: any) => sum + (r.amount_paid_cents ?? 0), 0)

  // Group by day
  const dayMap: Record<string, number> = {}
  for (const r of regs) {
    const day = (r as any).created_at?.slice(0, 10)
    if (day) dayMap[day] = (dayMap[day] ?? 0) + 1
  }
  const registrationsByDay = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  // Ticket breakdown
  const ttMap: Record<string, { name: string; count: number; revenueCents: number }> = {}
  for (const tt of ticketTypes ?? []) {
    ttMap[(tt as any).id] = { name: (tt as any).name, count: 0, revenueCents: 0 }
  }
  for (const r of confirmed) {
    const ttId = (r as any).ticket_type_id
    if (ttId && ttMap[ttId]) {
      ttMap[ttId].count++
      ttMap[ttId].revenueCents += (r as any).amount_paid_cents ?? 0
    }
  }
  const ticketBreakdown = Object.values(ttMap).map(t => ({ type: t.name, count: t.count, revenueCents: t.revenueCents }))

  const checkedInCount = checkins?.length ?? event?.checked_in_count ?? 0
  const confirmedCount = confirmed.length

  return {
    totalRegistrations: regs.length,
    confirmedRegistrations: confirmedCount,
    checkedIn: checkedInCount,
    checkInRate: confirmedCount > 0 ? Math.round((checkedInCount / confirmedCount) * 100) : 0,
    totalRevenueCents: totalRevenue,
    capacity: event?.capacity ?? null,
    capacityUsed: confirmedCount,
    surveyResponseCount: surveyResponses?.length ?? 0,
    registrationsByDay,
    ticketBreakdown,
    announcementCount: announcements?.length ?? 0,
  }
}
