import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: event } = await admin
    .from('events')
    .select('id, title, org_id, registration_count, checked_in_count, end_at, timezone, organizations(name)')
    .eq('lobby_token', token)
    .single()

  if (!event) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })

  // Auto-expire 3 days after the event ends — lobby displays at venues often stay
  // logged in long after the event, and stale tokens shouldn't keep leaking
  // attendee names. Organizer-side notification of expiry is Sprint B.
  const endAt = (event as any).end_at
  if (endAt) {
    const expiresAt = new Date(endAt).getTime() + 3 * 24 * 60 * 60 * 1000
    if (Date.now() > expiresAt) {
      return NextResponse.json(
        { expired: true, message: 'This event has ended' },
        { status: 410 },
      )
    }
  }

  const eventId = (event as any).id
  const now = new Date().toISOString()

  const [sessionsRes, leaderboardRes, sponsorsRes] = await Promise.all([
    admin.from('sessions')
      .select('id, title, starts_at, ends_at, rooms(name)')
      .eq('event_id', eventId)
      .gt('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(4),
    admin.from('leaderboard_points')
      .select('user_id, registration_id, points, registrations(attendee_name)')
      .eq('event_id', eventId)
      .order('points', { ascending: false })
      .limit(5),
    admin.from('event_sponsors')
      .select('id, name, logo_url, tier')
      .eq('event_id', eventId)
      .eq('is_featured', true)
      .order('sort_order', { ascending: true }),
  ])

  const leaderboard = ((leaderboardRes.data ?? []) as any[]).map(row => ({
    name: (row.registrations as any)?.attendee_name ?? 'Attendee',
    points: row.points ?? 0,
  }))

  return NextResponse.json({
    eventTitle: (event as any).title,
    orgName: ((event as any).organizations as any)?.name,
    timezone: (event as any).timezone ?? 'UTC',
    registrationCount: (event as any).registration_count ?? 0,
    checkedInCount: (event as any).checked_in_count ?? 0,
    upcomingSessions: sessionsRes.data ?? [],
    leaderboard,
    sponsors: sponsorsRes.data ?? [],
  })
}
