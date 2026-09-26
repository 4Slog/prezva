import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ilikeAnyOf } from '@/lib/db/postgrest-filter'
import { inactiveVolunteerResponse, isVolunteerActive } from '@/lib/volunteers/active'

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const query = req.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) return NextResponse.json({ results: [] })

  const admin = createAdminClient()

  const { data: vol } = await admin
    .from('volunteers')
    .select('id, role, event_id, status, shift_response')
    .eq('portal_access_token', token)
    .single()

  if (!vol) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  // Attendee search (names + emails) is for the roles the portal shows it to.
  if (!['check-in', 'registration-desk', 'team-lead'].includes((vol as any).role)) {
    return NextResponse.json({ error: 'This volunteer role does not have attendee search' }, { status: 403 })
  }
  // O158: attendee names and emails are for active volunteers only.
  if (!isVolunteerActive(vol as { status: string | null; shift_response: string | null })) return inactiveVolunteerResponse()

  // registrations has no checked_in_at and registration_status has no
  // 'checked_in' (either made the whole query fail): a door check-in is a
  // check_ins row with no session.
  const { data: regs, error } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_types(name), check_ins(checked_in_at, session_id)')
    .eq('event_id', (vol as any).event_id)
    .or(ilikeAnyOf(['attendee_name', 'attendee_email'], query))
    .in('status', ['confirmed', 'pending'])
    .limit(10)
  if (error) return NextResponse.json({ error: 'Search failed. Please try again.' }, { status: 500 })

  const results = ((regs ?? []) as any[]).map(r => ({
    id: r.id,
    name: r.attendee_name,
    email: r.attendee_email,
    status: r.status,
    ticket: r.ticket_types?.name,
    checked_in: ((r.check_ins ?? []) as Array<{ session_id: string | null }>).some(c => c.session_id === null),
  }))

  return NextResponse.json({ results })
}
