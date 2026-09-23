import { describe, it, expect } from 'vitest'
import { isoToZonedInput, zonedInputToIso, requireEventTimezone } from './zoned-input'

const NY = 'America/New_York'

describe('isoToZonedInput', () => {
  it('live case: 19:00Z reads 15:00 in New York (EDT)', () => {
    expect(isoToZonedInput('2026-09-23T19:00:00.000Z', NY)).toBe('2026-09-23T15:00')
  })

  it('accepts the +00:00 form Supabase returns', () => {
    expect(isoToZonedInput('2026-09-23T19:00:00+00:00', NY)).toBe('2026-09-23T15:00')
  })

  it('New York winter is UTC-5', () => {
    expect(isoToZonedInput('2026-01-15T14:00:00.000Z', NY)).toBe('2026-01-15T09:00')
  })

  it('Chicago summer is UTC-5', () => {
    expect(isoToZonedInput('2026-07-01T14:00:00.000Z', 'America/Chicago')).toBe('2026-07-01T09:00')
  })

  it('Kolkata is UTC+5:30 and crosses the date', () => {
    expect(isoToZonedInput('2026-09-23T20:00:00.000Z', 'Asia/Kolkata')).toBe('2026-09-24T01:30')
  })

  it('renders midnight as 00, not 24', () => {
    expect(isoToZonedInput('2026-09-24T04:00:00.000Z', NY)).toBe('2026-09-24T00:00')
  })

  it('throws on a naive (zone-less) string', () => {
    expect(() => isoToZonedInput('2026-09-23T19:00', NY)).toThrow(RangeError)
  })

  it('throws on garbage', () => {
    expect(() => isoToZonedInput('not a date', NY)).toThrow(RangeError)
  })
})

describe('zonedInputToIso', () => {
  it('live case: 15:00 New York is 19:00Z', () => {
    expect(zonedInputToIso('2026-09-23T15:00', NY)).toBe('2026-09-23T19:00:00.000Z')
  })

  it('New York winter', () => {
    expect(zonedInputToIso('2026-01-15T09:00', NY)).toBe('2026-01-15T14:00:00.000Z')
  })

  it('Chicago', () => {
    expect(zonedInputToIso('2026-07-01T09:00', 'America/Chicago')).toBe('2026-07-01T14:00:00.000Z')
    expect(zonedInputToIso('2026-12-01T09:00', 'America/Chicago')).toBe('2026-12-01T15:00:00.000Z')
  })

  it('Kolkata +5:30 crossing back a day', () => {
    expect(zonedInputToIso('2026-09-24T01:30', 'Asia/Kolkata')).toBe('2026-09-23T20:00:00.000Z')
  })

  it('accepts seconds', () => {
    expect(zonedInputToIso('2026-09-23T15:00:30', NY)).toBe('2026-09-23T19:00:30.000Z')
  })

  it('spring-forward: a skipped wall clock moves forward (02:30 → 03:30 EDT)', () => {
    // 2026-03-08: New York clocks jump 02:00 EST → 03:00 EDT.
    const iso = zonedInputToIso('2026-03-08T02:30', NY)
    expect(iso).toBe('2026-03-08T07:30:00.000Z')
    expect(isoToZonedInput(iso, NY)).toBe('2026-03-08T03:30')
  })

  it('spring-forward: the instants either side are exact', () => {
    expect(zonedInputToIso('2026-03-08T01:59', NY)).toBe('2026-03-08T06:59:00.000Z')
    expect(zonedInputToIso('2026-03-08T03:00', NY)).toBe('2026-03-08T07:00:00.000Z')
  })

  it('fall-back: an ambiguous wall clock takes the earlier (EDT) instant', () => {
    // 2026-11-01: New York repeats 01:00–01:59 (EDT, then EST).
    expect(zonedInputToIso('2026-11-01T01:30', NY)).toBe('2026-11-01T05:30:00.000Z')
  })

  it('fall-back: the instants either side are exact', () => {
    expect(zonedInputToIso('2026-11-01T00:30', NY)).toBe('2026-11-01T04:30:00.000Z')
    expect(zonedInputToIso('2026-11-01T02:30', NY)).toBe('2026-11-01T07:30:00.000Z')
  })

  it('throws on malformed input', () => {
    expect(() => zonedInputToIso('', NY)).toThrow(RangeError)
    expect(() => zonedInputToIso('2026-09-23 15:00', NY)).toThrow(RangeError)
    expect(() => zonedInputToIso('2026-09-23T15:00Z', NY)).toThrow(RangeError)
    expect(() => zonedInputToIso('2026-02-30T10:00', NY)).toThrow(RangeError)
    expect(() => zonedInputToIso('2026-09-23T25:00', NY)).toThrow(RangeError)
  })
})

describe('round trips', () => {
  const zones = [NY, 'America/Chicago', 'America/Los_Angeles', 'Asia/Kolkata', 'Europe/London', 'UTC']
  const instants = [
    '2026-01-15T14:00:00.000Z',
    '2026-03-08T07:00:00.000Z',
    '2026-06-30T23:45:00.000Z',
    '2026-09-23T19:00:00.000Z',
    '2026-11-01T06:30:00.000Z',
    '2026-12-31T23:59:00.000Z',
  ]
  for (const tz of zones) {
    it(`instant → wall clock → instant in ${tz}`, () => {
      for (const iso of instants) {
        const local = isoToZonedInput(iso, tz)
        const back = zonedInputToIso(local, tz)
        // Only the second fall-back hour can't round-trip (it maps to the earlier one).
        if (back !== iso) {
          expect(isoToZonedInput(back, tz)).toBe(local)
          expect(Date.parse(back)).toBeLessThan(Date.parse(iso))
        } else {
          expect(back).toBe(iso)
        }
      }
    })
  }

  it('the second fall-back hour is the only non-identity round trip in New York', () => {
    // 06:30Z on 2026-11-01 is 01:30 EST (the repeated hour).
    expect(zonedInputToIso(isoToZonedInput('2026-11-01T06:30:00.000Z', NY), NY)).toBe('2026-11-01T05:30:00.000Z')
    expect(zonedInputToIso(isoToZonedInput('2026-09-23T19:00:00.000Z', NY), NY)).toBe('2026-09-23T19:00:00.000Z')
  })
})

describe('invalid zone', () => {
  it('both helpers throw', () => {
    expect(() => isoToZonedInput('2026-09-23T19:00:00.000Z', 'Mars/Olympus')).toThrow(RangeError)
    expect(() => zonedInputToIso('2026-09-23T15:00', 'Mars/Olympus')).toThrow(RangeError)
    expect(() => zonedInputToIso('2026-09-23T15:00', '')).toThrow(RangeError)
  })

  it('requireEventTimezone fails loud on missing or bogus zones', () => {
    expect(requireEventTimezone(NY)).toBe(NY)
    expect(() => requireEventTimezone(undefined)).toThrow(RangeError)
    expect(() => requireEventTimezone(null)).toThrow(RangeError)
    expect(() => requireEventTimezone('')).toThrow(RangeError)
    expect(() => requireEventTimezone('Not/AZone')).toThrow(RangeError)
  })
})
