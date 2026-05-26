import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendVolunteerInvite } from '@/lib/trigger'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  await requireUser()
  const { id, volunteerId } = await params
  // Admin client: read volunteer + event for resend
  const admin = createAdminClient()
  const { data: volunteer } = await admin
    .from('volunteers')
    .select('*, events(title, start_at, slug)')
    .eq('id', volunteerId)
    .maybeSingle()

  if (!volunteer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const event = volunteer.events as { title: string; start_at: string; slug: string } | null
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  void sendVolunteerInvite({
    volunteerName:  volunteer.name,
    volunteerEmail: volunteer.email,
    volunteerRole:  volunteer.role,
    eventTitle:     event?.title ?? id,
    eventDate:      event?.start_at ?? '',
    shiftStart:     volunteer.shift_start ?? null,
    shiftEnd:       volunteer.shift_end ?? null,
    portalUrl:      `${appUrl}/volunteer/${volunteer.portal_access_token}`,
  })

  return NextResponse.json({ ok: true })
}
