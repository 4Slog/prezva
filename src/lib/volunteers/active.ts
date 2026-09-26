import { NextResponse } from 'next/server'

// O158 / G-R5: a volunteer's portal token keeps working after they decline or
// are marked a no-show, so the portal routes that act for the event (door
// check-in, clock-in, attendee lookup) check the volunteer is still active.
// An organizer can set status 'declined'/'no_show'; a volunteer's own decline
// is recorded in shift_response. 'invited' stays allowed: most volunteers
// never answer the shift request.
export const VOLUNTEER_INACTIVE_ERROR =
  'This volunteer is not active for this event. Ask the organizer to re-invite you.'

const INACTIVE_STATUSES = new Set(['declined', 'no_show'])

export function isVolunteerActive(v: { status?: string | null; shift_response?: string | null }): boolean {
  if (v.status && INACTIVE_STATUSES.has(v.status)) return false
  if (v.shift_response === 'declined') return false
  return true
}

export function inactiveVolunteerResponse() {
  return NextResponse.json({ error: VOLUNTEER_INACTIVE_ERROR }, { status: 403 })
}
