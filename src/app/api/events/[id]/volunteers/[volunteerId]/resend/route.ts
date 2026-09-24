import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { enqueueVolunteerInvite } from '@/lib/trigger'
import { checkRateLimit, volunteerInviteLimiter } from '@/lib/ratelimit'
import { resolveVolunteerTarget } from '@/lib/volunteers/route-auth'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; volunteerId: string }> }
) {
  const user = await requireUser()
  const { id, volunteerId } = await params
  const target = await resolveVolunteerTarget(id, volunteerId, user.id)
  if (target instanceof NextResponse) return target

  const { limited } = await checkRateLimit(volunteerInviteLimiter, user.id)
  if (limited) return NextResponse.json({ error: 'Too many invites sent. Try again in a few minutes.' }, { status: 429 })

  const { volunteer, event } = target
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://prezva.app'

  void enqueueVolunteerInvite({
    volunteerName:  volunteer.name,
    volunteerEmail: volunteer.email,
    volunteerRole:  volunteer.role,
    eventTitle:     event.title,
    eventDate:      event.start_at,
    shiftStart:     volunteer.shift_start ?? null,
    shiftEnd:       volunteer.shift_end ?? null,
    eventTimezone:  event.timezone ?? undefined,
    portalUrl:      `${appUrl}/volunteer/${volunteer.portal_access_token}`,
  })

  return NextResponse.json({ ok: true })
}
