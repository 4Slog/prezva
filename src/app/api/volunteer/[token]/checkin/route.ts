import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { inactiveVolunteerResponse, isVolunteerActive } from '@/lib/volunteers/active'
import { recordDoorQrCheckIn, QR_LOOKUP_FAILED, QR_NOT_FOUND_FOR_EVENT } from '@/lib/checkin/door-checkin'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await req.json().catch(() => ({}))
  const qrCode = (body as any).qr_code as string | undefined

  if (!qrCode) return NextResponse.json({ error: 'Missing qr_code' }, { status: 400 })

  const admin = createAdminClient()

  // Validate volunteer token
  const { data: volunteer } = await admin.rpc('get_volunteer_by_token', { p_token: token })
  if (!volunteer?.event_id) return NextResponse.json({ error: 'Invalid volunteer token' }, { status: 401 })

  const allowedRoles = ['check-in', 'registration-desk']
  if (!allowedRoles.includes(volunteer.role)) {
    return NextResponse.json({ error: 'This volunteer role does not have check-in access' }, { status: 403 })
  }
  // O158: a declined or no-show volunteer's token no longer checks people in.
  if (!isVolunteerActive(volunteer)) return inactiveVolunteerResponse()

  // O153 / F-R14: the shared door check-in — R90 refusals, door-once, audit
  // with the volunteer as actor, points, source 'volunteer', case-insensitive
  // QR. The token and role checks above are unchanged; the service-role client
  // is scoped to the volunteer's own event.
  const result = await recordDoorQrCheckIn(
    admin,
    { kind: 'volunteer', userId: volunteer.user_id ?? null, volunteerId: volunteer.id, email: volunteer.email ?? null },
    volunteer.event_id,
    qrCode,
    'volunteer-portal',
  )

  // Same JSON shape the volunteer portal has always read.
  if (!result.success || !result.registration) {
    if (result.refusal) return NextResponse.json({ error: result.error }, { status: 400 })
    if (result.error === QR_NOT_FOUND_FOR_EVENT) return NextResponse.json({ error: QR_NOT_FOUND_FOR_EVENT }, { status: 404 })
    if (result.error === QR_LOOKUP_FAILED) return NextResponse.json({ error: QR_LOOKUP_FAILED }, { status: 500 })
    console.error('[volunteer checkin] door check-in failed', result.error)
    return NextResponse.json({ error: 'Could not check this attendee in. Please try again.' }, { status: 500 })
  }

  const r = result.registration
  return NextResponse.json({
    ok: true,
    already_checked_in: r.already_checked_in,
    attendee_name: r.attendee_name,
    ticket_type_name: r.ticket_name || 'Ticket',
    ...(r.already_checked_in ? { checked_in_at: r.check_in_time ?? null } : {}),
  })
}
