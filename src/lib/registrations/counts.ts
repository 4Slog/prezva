import { createAdminClient } from '@/lib/supabase/admin'

export interface EventCounts {
  total: number
  confirmed: number
  checkedIn: number
  cancelled: number
  waitlisted: number
  pending: number
}

export async function getEventCounts(eventId: string): Promise<EventCounts> {
  // Admin client: count queries bypass RLS for accurate aggregate data
  const admin = createAdminClient()

  const [regsRes, checkinsRes] = await Promise.all([
    admin
      .from('registrations')
      .select('status')
      .eq('event_id', eventId),
    admin
      .from('check_ins')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId),
  ])

  const regs = regsRes.data ?? []
  const confirmed = regs.filter(r => r.status === 'confirmed').length
  const cancelled = regs.filter(r => r.status === 'cancelled').length
  const waitlisted = regs.filter(r => r.status === 'waitlisted').length
  const pending = regs.filter(r => r.status === 'pending').length

  return {
    total: regs.length,
    confirmed,
    checkedIn: checkinsRes.count ?? 0,
    cancelled,
    waitlisted,
    pending,
  }
}
