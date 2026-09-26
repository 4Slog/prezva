// O168 / H-R3 (Paul): a volunteer's own decline is undoable. Re-inviting a
// declined (or no-show) volunteer puts them back to invited with no response,
// so the portal asks again and the G-R5 gate lets them in. A confirmed or
// checked-in volunteer is not changed by a resend. The portal token is kept.
// Pure (no server imports): the dashboard list uses it too.

type VolunteerState = {
  status?: string | null
  shift_response?: string | null
  shift_response_at?: string | null
  shift_decline_reason?: string | null
}

export function isVolunteerDeclined(v: VolunteerState): boolean {
  return v.status === 'declined' || v.status === 'no_show' || v.shift_response === 'declined'
}

export const REINVITE_RESET = {
  status: 'invited',
  shift_response: null,
  shift_response_at: null,
  shift_decline_reason: null,
} as const

// What to write back if the invite could not be sent after a reset.
export function reinviteRestore(v: VolunteerState) {
  return {
    status: v.status ?? 'invited',
    shift_response: v.shift_response ?? null,
    shift_response_at: v.shift_response_at ?? null,
    shift_decline_reason: v.shift_decline_reason ?? null,
  }
}

export const INVITE_SEND_FAILED = 'Could not send the invite.'
