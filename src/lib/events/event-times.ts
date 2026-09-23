// Event start/end resolution shared by the dashboard and embedded create/update
// actions. D5: an event's times belong to the EVENT's timezone. Conversions go
// through src/lib/datetime/zoned-input.ts; GHL-style ISO instants pass through.

import { inputToInstant, resolveEditedInstant, requireEventTimezone } from '@/lib/datetime/zoned-input'

type TimesError = { error: string }

function validZone(timeZone: unknown): string | null {
  try {
    return requireEventTimezone(timeZone)
  } catch {
    return null
  }
}

/** Create: both times are wall clocks in `timeZone` (or zone-carrying instants). */
export function resolveCreateTimes(
  startAt: string,
  endAt: string,
  timeZone: string,
): { start_at: string; end_at: string } | TimesError {
  if (!validZone(timeZone)) return { error: `Unknown timezone: ${timeZone}` }
  let start_at: string
  let end_at: string
  try {
    start_at = inputToInstant(startAt, timeZone)
  } catch {
    return { error: 'Start is not a valid date and time.' }
  }
  try {
    end_at = inputToInstant(endAt, timeZone)
  } catch {
    return { error: 'End is not a valid date and time.' }
  }
  if (Date.parse(end_at) <= Date.parse(start_at)) return { error: 'End time must be after start time' }
  return { start_at, end_at }
}

/**
 * Update: a submitted time the organizer did not edit (it equals the stored instant
 * as displayed in the event's STORED zone) keeps the stored instant exactly, even
 * when the zone changes. An edited time is read in the submitted zone, else the
 * stored one. Returns only the keys that were submitted.
 */
export function resolveUpdateTimes(
  submitted: { start_at?: string; end_at?: string; timezone?: string },
  stored: { start_at: string; end_at: string; timezone: string },
): { start_at?: string; end_at?: string; timezone?: string } | TimesError {
  const targetZone = submitted.timezone ?? stored.timezone
  if (!validZone(targetZone)) return { error: `Unknown timezone: ${targetZone}` }
  if (!validZone(stored.timezone)) return { error: `The event's stored timezone is invalid: ${stored.timezone}` }

  const patch: { start_at?: string; end_at?: string; timezone?: string } = {}
  if (submitted.timezone !== undefined) patch.timezone = submitted.timezone

  if (submitted.start_at !== undefined) {
    try {
      patch.start_at = resolveEditedInstant(submitted.start_at, stored.start_at, stored.timezone, targetZone)
    } catch {
      return { error: 'Start is not a valid date and time.' }
    }
  }
  if (submitted.end_at !== undefined) {
    try {
      patch.end_at = resolveEditedInstant(submitted.end_at, stored.end_at, stored.timezone, targetZone)
    } catch {
      return { error: 'End is not a valid date and time.' }
    }
  }

  if (patch.start_at !== undefined || patch.end_at !== undefined) {
    const start = Date.parse(patch.start_at ?? stored.start_at)
    const end = Date.parse(patch.end_at ?? stored.end_at)
    if (!(end > start)) return { error: 'End time must be after start time' }
  }
  return patch
}
