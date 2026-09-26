import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/get-user'
import { enqueueVolunteerInvite } from '@/lib/trigger'
import { checkRateLimit, volunteerInviteLimiter } from '@/lib/ratelimit'
import { resolveVolunteerTarget } from '@/lib/volunteers/route-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { INVITE_SEND_FAILED, REINVITE_RESET, isVolunteerDeclined, reinviteRestore } from '@/lib/volunteers/reinvite'

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

  // O168: re-inviting a declined volunteer restores their access.
  const reset = isVolunteerDeclined(volunteer)
  // Captured before the reset, in case the invite cannot be sent.
  const restore = reinviteRestore(volunteer)
  if (reset) {
    const { error } = await createAdminClient()
      .from('volunteers')
      .update(REINVITE_RESET)
      .eq('id', volunteer.id)
      .eq('event_id', event.id)
    if (error) {
      console.error('[volunteers] re-invite reset failed', { volunteerId: volunteer.id, error: error.message })
      return NextResponse.json({ error: INVITE_SEND_FAILED }, { status: 500 })
    }
  }

  const handle = await enqueueVolunteerInvite({
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
  if (!handle) {
    // No invite went out: the volunteer stays as they were.
    if (reset) {
      const { error } = await createAdminClient().from('volunteers').update(restore).eq('id', volunteer.id).eq('event_id', event.id)
      if (error) console.error('[volunteers] re-invite restore failed', { volunteerId: volunteer.id, error: error.message })
    }
    return NextResponse.json({ error: INVITE_SEND_FAILED }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
