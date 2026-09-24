// Who may be admitted, in one place (R90). The door and the session scanners
// admit CONFIRMED registrations only; every other status is refused and nothing
// is written. The door result names the attendee and tells staff what to do.
// There is no door override.

export const ADMITTED_STATUS = 'confirmed'

export type RefusalKind = 'cancelled' | 'refunded' | 'pending' | 'waitlisted' | 'not_confirmed'

export interface DoorRefusal {
  kind: RefusalKind
  attendeeName: string
  /** What is wrong with the ticket, e.g. "Registration was refunded". */
  reason: string
  /** What the door staff should do next. */
  guidance: string
}

const REFUSALS: Record<RefusalKind, { reason: string; guidance: string }> = {
  cancelled:     { reason: 'Registration is cancelled',        guidance: 'Send them to the registration desk.' },
  refunded:      { reason: 'Registration was refunded',        guidance: 'Send them to the registration desk.' },
  pending:       { reason: 'Registration is pending',          guidance: 'Awaiting approval — not yet admitted.' },
  waitlisted:    { reason: 'Registration is on the waitlist',  guidance: 'No ticket — waitlisted only.' },
  not_confirmed: { reason: 'Registration is not confirmed',    guidance: 'Send them to the registration desk.' },
}

export function isAdmittable(status: string | null | undefined): boolean {
  return status === ADMITTED_STATUS
}

function refusalKind(status: string | null | undefined): RefusalKind | null {
  if (isAdmittable(status)) return null
  if (status === 'cancelled' || status === 'refunded' || status === 'pending' || status === 'waitlisted') return status
  return 'not_confirmed'
}

/** The door refusal for a registration, or null when it may be admitted. */
export function doorRefusal(status: string | null | undefined, attendeeName: string | null | undefined): DoorRefusal | null {
  const kind = refusalKind(status)
  if (!kind) return null
  return { kind, attendeeName: attendeeName?.trim() || 'This attendee', ...REFUSALS[kind] }
}

/** One-line error text for a refused door check-in. */
export function doorRefusalMessage(r: DoorRefusal): string {
  return `Do not admit ${r.attendeeName}: ${r.reason}. ${r.guidance}`
}

/**
 * Session scanners (R80): confirmed-only, with the dashboard's wording. Same
 * allowlist as the door; the session result keeps its short messages.
 */
export function sessionStatusError(status: string): string | null {
  if (status === 'cancelled') return 'Registration is cancelled'
  if (status === 'refunded') return 'Registration was refunded'
  if (!isAdmittable(status)) return 'Registration is not confirmed'
  return null
}
