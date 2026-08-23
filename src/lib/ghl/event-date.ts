// Event-timezone date formatters for GHL merge fields.
//
// Both formatters live here, together, deliberately. They share one discipline
// — format in the EVENT'S own timezone, return null rather than guess — and
// splitting them across modules would let the next person changing that
// discipline update one and miss the other. post-registration-writeback.ts
// re-exports eventDateInEventTz so every existing import keeps working.

// Formats an event start timestamp as a calendar date in the event's OWN
// timezone. An 8pm March 14 America/New_York event is March 15 in UTC, so
// formatting in UTC would make every reminder fire a day late. Returns null
// rather than throwing or falling back to UTC — a missing date is honest, a
// wrong date is not.
export function eventDateInEventTz(startAt: string | null, timeZone: string | null): string | null {
  if (!startAt || !timeZone) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(startAt))
  } catch {
    return null
  }
}

// Formats an event END timestamp as a human-readable completion date ("June 1,
// 2026") in the event's own timezone, for the certificate template's
// {{contact.prezva_completion_date}} merge tag.
//
// end_at, not start_at: a multi-day conference is completed on its LAST day,
// and that is the date a licensing board expects on a CE certificate. This is
// also why it cannot reuse prezva_event_date, which carries the START and is
// what the reminder path depends on.
//
// Preformatted TEXT rather than a GHL DATE field: the rendered output stays
// fully under our control instead of depending on GHL's date serializer, which
// is undocumented and untested.
//
// Same null-over-wrong stance as eventDateInEventTz above, and for the same
// reason — the caller omits the field entirely rather than merging a blank or
// a date that is off by a day.
export function eventCompletionDateInEventTz(
  endAt: string | null,
  timeZone: string | null,
): string | null {
  if (!endAt || !timeZone) return null
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(endAt))
  } catch {
    return null
  }
}
