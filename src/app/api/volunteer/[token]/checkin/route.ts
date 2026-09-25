import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUniqueViolation } from '@/lib/checkin/offline-sync'

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

  // Find registration by QR code — only within the volunteer's own event
  const { data: reg, error: regError } = await admin
    .from('registrations')
    .select('id, event_id, attendee_name, attendee_email, status, ticket_type_id, ticket_types(name)')
    .eq('qr_code', qrCode)
    .eq('event_id', volunteer.event_id)
    .maybeSingle()

  if (regError) return NextResponse.json({ error: 'Could not look up this QR code. Please try again.' }, { status: 500 })
  if (!reg) return NextResponse.json({ error: 'QR code not found' }, { status: 404 })
  // 'checked_in' is not a registration_status value: a check-in lives only in
  // check_ins, and the registration stays 'confirmed'.
  if ((reg as any).status !== 'confirmed') {
    return NextResponse.json({ error: 'Registration is not confirmed' }, { status: 400 })
  }

  const alreadyCheckedIn = async () => {
    const { data: existing, error: existingError } = await admin
      .from('check_ins')
      .select('id, checked_in_at')
      .eq('registration_id', reg.id)
      .is('session_id', null)
      .maybeSingle()
    if (existingError) console.error('[volunteer checkin] re-read failed', existingError.message)
    return NextResponse.json({
      ok: true,
      already_checked_in: true,
      attendee_name: (reg as any).attendee_name,
      ticket_type_name: (reg as any).ticket_types?.name ?? 'Ticket',
      checked_in_at: existing?.checked_in_at ?? null,
    })
  }

  // Mark checked in. check_ins_door_once allows one door check-in per
  // registration: a 23505 means this attendee is already checked in.
  const { error: insertError } = await admin.from('check_ins').insert({
    registration_id: reg.id, event_id: reg.event_id, checked_in_by: null, method: 'qr_scan', synced_at: new Date().toISOString(),
  })
  if (insertError) {
    if (isUniqueViolation(insertError)) return alreadyCheckedIn()
    return NextResponse.json({ error: 'Could not check this attendee in. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    already_checked_in: false,
    attendee_name: (reg as any).attendee_name,
    ticket_type_name: (reg as any).ticket_types?.name ?? 'Ticket',
  })
}
