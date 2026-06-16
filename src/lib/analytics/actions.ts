'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
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
  virtualAttendees: number
  inPersonAttendees: number
  // Registration pace
  registrationsLast24h: number
  registrationsLast7d: number
  // Check-in velocity
  checkInsLast30min: number
  checkInsLast60min: number
  estimatedMinutesToComplete: number | null
  // Revenue intelligence
  compTicketCount: number
  paidTicketCount: number
  freeTicketCount: number
  averageTicketValueCents: number
  sessionPopularity: {
    session_id: string
    title: string
    feedback_count: number
    avg_rating: number
    attendee_count: number
  }[]
}

export async function computeEventAnalytics(supabase: SupabaseClient, eventId: string): Promise<EventAnalytics> {
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const last7d  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString()
  const last30m = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const last60m = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  const last14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

  const [
    { data: event },
    { data: registrations },
    { data: checkins },
    { data: surveyResponses },
    { data: announcements },
    { data: ticketTypes },
    ci30m,
    ci60m,
  ] = await Promise.all([
    supabase.from('events').select('capacity, registration_count, checked_in_count').eq('id', eventId).single(),
    supabase.from('registrations').select('status, amount_paid_cents, ticket_type_id, created_at, delivery_method, payment_method').eq('event_id', eventId),
    supabase.from('check_ins').select('id').eq('event_id', eventId).is('session_id', null),
    supabase.from('survey_responses').select('id, surveys!inner(event_id)').eq('surveys.event_id', eventId),
    supabase.from('announcements').select('id').eq('event_id', eventId),
    supabase.from('ticket_types').select('id, name, type').eq('event_id', eventId),
    supabase.from('check_ins').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).is('session_id', null).gte('created_at', last30m),
    supabase.from('check_ins').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).is('session_id', null).gte('created_at', last60m),
  ])

  const regs = registrations ?? []
  const confirmed = regs.filter((r: any) => r.status === 'confirmed')
  const totalRevenue = confirmed.reduce((sum: number, r: any) => sum + (r.amount_paid_cents ?? 0), 0)

  // Session popularity
  const { data: sessionData } = await supabase
    .from('sessions')
    .select('id, title')
    .eq('event_id', eventId)

  const sessionIds = ((sessionData ?? []) as any[]).map(s => s.id)

  let sessionPopularity: {
    session_id: string
    title: string
    feedback_count: number
    avg_rating: number
    attendee_count: number
  }[] = []

  if (sessionIds.length > 0) {
    const [feedbackRes, sessionCheckInsRes, sessionAttendanceRes] = await Promise.all([
      supabase.from('session_feedback')
        .select('session_id, rating')
        .in('session_id', sessionIds),
      supabase.from('check_ins')
        .select('session_id, registration_id')
        .in('session_id', sessionIds)
        .not('session_id', 'is', null),
      supabase.from('session_attendance')
        .select('session_id, registration_id')
        .in('session_id', sessionIds),
    ])

    sessionPopularity = ((sessionData ?? []) as any[]).map(s => {
      const fb = ((feedbackRes.data ?? []) as any[]).filter(f => f.session_id === s.id)
      const ratings = fb.map((f: any) => f.rating).filter(Boolean)
      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
        : 0
      // Union check_ins and session_attendance by registration_id for deduplication
      const regIds = new Set<string>([
        ...((sessionCheckInsRes.data ?? []) as any[])
          .filter(c => c.session_id === s.id && c.registration_id)
          .map((c: any) => c.registration_id as string),
        ...((sessionAttendanceRes.data ?? []) as any[])
          .filter(c => c.session_id === s.id && c.registration_id)
          .map((c: any) => c.registration_id as string),
      ])
      const attendeeCount = regIds.size

      return {
        session_id: s.id,
        title: s.title,
        feedback_count: fb.length,
        avg_rating: avgRating,
        attendee_count: attendeeCount,
      }
    }).sort((a: any, b: any) => b.feedback_count - a.feedback_count)
  }

  // Registration pace from already-fetched data
  const registrationsLast24h = regs.filter((r: any) =>
    r.created_at && r.created_at >= last24h &&
    (r.status === 'confirmed' || r.status === 'pending')
  ).length
  const registrationsLast7d = regs.filter((r: any) =>
    r.created_at && r.created_at >= last7d &&
    (r.status === 'confirmed' || r.status === 'pending')
  ).length

  // registrationsByDay — last 14 days, pre-populated
  const dayMap: Record<string, number> = {}
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dayMap[d.toISOString().slice(0, 10)] = 0
  }
  for (const r of regs) {
    const day = (r as any).created_at?.slice(0, 10)
    if (day && day >= last14d.slice(0, 10) && day in dayMap &&
        ((r as any).status === 'confirmed' || (r as any).status === 'pending')) {
      dayMap[day]++
    }
  }
  const registrationsByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }))

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
  const virtualAttendees = confirmed.filter((r: any) => r.delivery_method === 'virtual').length
  const inPersonAttendees = confirmed.filter((r: any) => r.delivery_method !== 'virtual').length

  // Check-in velocity
  const checkInsLast30min = ci30m.count ?? 0
  const checkInsLast60min = ci60m.count ?? 0
  const remaining = confirmedCount - checkedInCount
  const ratePerMin = checkInsLast30min / 30
  const estimatedMinutesToComplete = ratePerMin > 0 ? Math.round(remaining / ratePerMin) : null

  // Revenue intelligence
  const compCount = (confirmed as any[]).filter(r =>
    r.payment_method === 'comp' || (r.amount_paid_cents === 0 && r.payment_method === 'comp')
  ).length
  const paidCount = (confirmed as any[]).filter(r => (r.amount_paid_cents ?? 0) > 0).length
  const freeTicketCount = (confirmed as any[]).filter(r =>
    (r.amount_paid_cents ?? 0) === 0 && r.payment_method !== 'comp'
  ).length
  const avgCents = paidCount > 0 ? Math.round(totalRevenue / paidCount) : 0

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
    virtualAttendees,
    inPersonAttendees,
    registrationsLast24h,
    registrationsLast7d,
    checkInsLast30min,
    checkInsLast60min,
    estimatedMinutesToComplete,
    compTicketCount: compCount,
    paidTicketCount: paidCount,
    freeTicketCount,
    averageTicketValueCents: avgCents,
    sessionPopularity,
  }
}

export async function getEventAnalytics(eventId: string): Promise<EventAnalytics> {
  const supabase = await createClient()
  await requireUser()
  return computeEventAnalytics(supabase, eventId)
}
