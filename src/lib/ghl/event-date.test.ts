// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { eventDateInEventTz, eventCompletionDateInEventTz } from './event-date'
// The re-export chain event-date -> post-registration-writeback -> payment route
// is what keeps every existing call site working after the move. Importing the
// re-exported binding here makes a broken chain a failing test rather than a
// build-time surprise.
import { eventDateInEventTz as reExported } from './post-registration-writeback'

describe('eventDateInEventTz — unchanged by the move', () => {
  it('formats in the event timezone, not UTC', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', 'America/New_York')).toBe('2026-03-14')
  })

  it('is the same function post-registration-writeback re-exports', () => {
    expect(reExported).toBe(eventDateInEventTz)
  })
})

describe('eventCompletionDateInEventTz', () => {
  it('formats a human-readable long-form date', () => {
    expect(eventCompletionDateInEventTz('2026-06-01T16:00:00Z', 'America/New_York')).toBe('June 1, 2026')
  })

  // The exact case the eventDateInEventTz comment calls out: an 8pm March 14
  // America/New_York timestamp is already March 15 in UTC. Formatting in UTC
  // would put the wrong calendar day on a CE certificate.
  it('does not slip a day across the UTC boundary', () => {
    expect(eventCompletionDateInEventTz('2026-03-15T00:00:00Z', 'America/New_York')).toBe('March 14, 2026')
  })

  it('formats the same instant as the next day in UTC — proving the tz is doing the work', () => {
    expect(eventCompletionDateInEventTz('2026-03-15T00:00:00Z', 'UTC')).toBe('March 15, 2026')
  })

  it('returns null on a missing end date rather than guessing', () => {
    expect(eventCompletionDateInEventTz(null, 'America/New_York')).toBeNull()
  })

  it('returns null on a missing timezone rather than falling back to UTC', () => {
    expect(eventCompletionDateInEventTz('2026-06-01T16:00:00Z', null)).toBeNull()
  })

  it('returns null on an invalid timezone rather than throwing', () => {
    expect(eventCompletionDateInEventTz('2026-06-01T16:00:00Z', 'Not/AZone')).toBeNull()
  })

  // end_at, not start_at: a multi-day conference is completed on its LAST day,
  // and that is the date a licensing board expects.
  it('reports the last day of a multi-day event when given end_at', () => {
    const startAt = '2026-05-29T13:00:00Z'
    const endAt = '2026-05-31T21:00:00Z'
    expect(eventCompletionDateInEventTz(endAt, 'America/Chicago')).toBe('May 31, 2026')
    expect(eventCompletionDateInEventTz(startAt, 'America/Chicago')).toBe('May 29, 2026')
  })
})
