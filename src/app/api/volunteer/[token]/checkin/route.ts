import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  if (!volunteer) return NextResponse.json({ error: 'Invalid volunteer token' }, { status: 401 })

  const allowedRoles = ['check-in', 'registration-desk']
  if (!allowedRoles.includes(volunteer.role)) {
    return NextResponse.json({ error: 'This volunteer role does not have check-in access' }, { status: 403 })
  }

  // Find registration by QR code
  const { data: reg } = await admin
    .from('registrations')
    .select('id, attendee_name, attendee_email, status, ticket_type_id, ticket_types(name)')
    .eq('qr_code', qrCode)
    .maybeSingle()

  if (!reg) return NextResponse.json({ error: 'QR code not found' }, { status: 404 })
  if (!['confirmed', 'checked_in'].includes((reg as any).status)) {
    return NextResponse.json({ error: 'Registration is not confirmed' }, { status: 400 })
  }

  // Check if already checked in
  const { data: existing } = await admin
    .from('check_ins')
    .select('id, created_at')
    .eq('registration_id', reg.id)
    .is('session_id', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      ok: true,
      already_checked_in: true,
      attendee_name: (reg as any).attendee_name,
      ticket_type_name: (reg as any).ticket_types?.name ?? 'Ticket',
      checked_in_at: existing.created_at,
    })
  }

  // Mark checked in
  const now = new Date().toISOString()
  await admin.from('check_ins').insert({ registration_id: reg.id, checked_in_by: null, created_at: now })
  await admin.from('registrations').update({ status: 'checked_in', checked_in_at: now }).eq('id', reg.id)

  return NextResponse.json({
    ok: true,
    already_checked_in: false,
    attendee_name: (reg as any).attendee_name,
    ticket_type_name: (reg as any).ticket_types?.name ?? 'Ticket',
  })
}
