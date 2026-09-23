import { describe, it, expect } from 'vitest'
import { resolveCreateTimes, resolveUpdateTimes } from './event-times'
import { isoToZonedInput } from '@/lib/datetime/zoned-input'

const NY = 'America/New_York'
const LA = 'America/Los_Angeles'

describe('resolveCreateTimes', () => {
  it('reads 15:00 in New York as 19:00Z', () => {
    expect(resolveCreateTimes('2026-09-23T15:00', '2026-09-23T17:00', NY))
      .toEqual({ start_at: '2026-09-23T19:00:00.000Z', end_at: '2026-09-23T21:00:00.000Z' })
  })

  it('reads 15:00 in Chicago as 20:00Z', () => {
    expect(resolveCreateTimes('2026-09-23T15:00', '2026-09-23T17:00', 'America/Chicago'))
      .toEqual({ start_at: '2026-09-23T20:00:00.000Z', end_at: '2026-09-23T22:00:00.000Z' })
  })

  it('passes Z instants through unchanged (GHL-style)', () => {
    expect(resolveCreateTimes('2026-10-15T13:00:00Z', '2026-10-16T21:00:00Z', NY))
      .toEqual({ start_at: '2026-10-15T13:00:00Z', end_at: '2026-10-16T21:00:00Z' })
  })

  it('refuses an end before the start after conversion', () => {
    expect(resolveCreateTimes('2026-09-23T15:00', '2026-09-23T14:59', NY)).toEqual({ error: 'End time must be after start time' })
    // Wall clocks look ordered, but the Z end is before the converted start (19:00Z).
    expect(resolveCreateTimes('2026-09-23T15:00', '2026-09-23T18:00:00Z', NY)).toEqual({ error: 'End time must be after start time' })
  })

  it('returns an error (not a throw) for a bad value or zone', () => {
    expect(resolveCreateTimes('soon', '2026-09-23T17:00', NY)).toEqual({ error: 'Start is not a valid date and time.' })
    expect(resolveCreateTimes('2026-09-23T15:00', '2026-02-30T10:00', NY)).toEqual({ error: 'End is not a valid date and time.' })
    expect(resolveCreateTimes('2026-09-23T15:00', '2026-09-23T17:00', 'Mars/Olympus')).toEqual({ error: 'Unknown timezone: Mars/Olympus' })
  })
})

describe('resolveUpdateTimes (Paul: changing the zone never moves the event)', () => {
  const stored = { start_at: '2026-09-23T19:00:00+00:00', end_at: '2026-09-23T21:00:00+00:00', timezone: NY }

  it('a timezone-only change keeps both stored instants exactly, and the form then reads 12:00 Pacific', () => {
    const patch = resolveUpdateTimes({ start_at: '2026-09-23T15:00', end_at: '2026-09-23T17:00', timezone: LA }, stored)
    expect(patch).toEqual({ timezone: LA, start_at: stored.start_at, end_at: stored.end_at })
    expect(isoToZonedInput((patch as { start_at: string }).start_at, LA)).toBe('2026-09-23T12:00')
  })

  it('an edited time with a zone change is read in the NEW zone; the untouched one keeps its instant', () => {
    const patch = resolveUpdateTimes({ start_at: '2026-09-23T13:00', end_at: '2026-09-23T17:00', timezone: LA }, stored)
    expect(patch).toEqual({ timezone: LA, start_at: '2026-09-23T20:00:00.000Z', end_at: stored.end_at })
  })

  it('an edited time without a zone change is read in the stored zone', () => {
    expect(resolveUpdateTimes({ start_at: '2026-09-23T16:00', end_at: '2026-09-23T18:00' }, stored))
      .toEqual({ start_at: '2026-09-23T20:00:00.000Z', end_at: '2026-09-23T22:00:00.000Z' })
  })

  it('a zone-carrying value passes through', () => {
    expect(resolveUpdateTimes({ start_at: '2026-09-23T18:00:00Z' }, stored)).toEqual({ start_at: '2026-09-23T18:00:00Z' })
  })

  it('refuses end before start, using the stored value for the one not submitted', () => {
    expect(resolveUpdateTimes({ start_at: '2026-09-23T18:00' }, stored)).toEqual({ error: 'End time must be after start time' })
    expect(resolveUpdateTimes({ end_at: '2026-09-23T14:00' }, stored)).toEqual({ error: 'End time must be after start time' })
  })

  it('refuses an unknown submitted zone', () => {
    expect(resolveUpdateTimes({ timezone: 'Not/AZone' }, stored)).toEqual({ error: 'Unknown timezone: Not/AZone' })
  })
})
