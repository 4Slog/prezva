// Conversions between a UTC instant and the "YYYY-MM-DDTHH:mm" wall-clock string a
// <input type="datetime-local"> holds, read in a given IANA zone. D5: session and
// event times belong to the EVENT's timezone, never the viewer's browser or the
// server's. Built on Intl only.

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') {
    throw new RangeError(`Invalid time zone: ${JSON.stringify(timeZone)}`)
  }
  let f = formatters.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      throw new RangeError(`Invalid time zone: ${JSON.stringify(timeZone)}`)
    }
    formatters.set(timeZone, f)
  }
  return f
}

type WallClock = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function wallClockAt(utcMs: number, timeZone: string): WallClock {
  const parts: Record<string, string> = {}
  for (const p of formatterFor(timeZone).formatToParts(new Date(utcMs))) parts[p.type] = p.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some engines render midnight as "24" even with hourCycle h23.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

// The zone's UTC offset (ms, east positive) in effect at the given instant.
function offsetAt(utcMs: number, timeZone: string): number {
  const w = wallClockAt(utcMs, timeZone)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** Throws unless `timeZone` is a non-empty IANA zone name Intl can resolve. */
export function requireEventTimezone(timeZone: unknown): string {
  formatterFor(timeZone as string)
  return timeZone as string
}

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i

/**
 * A UTC instant (ISO string carrying Z or an offset) → "YYYY-MM-DDTHH:mm" as the
 * wall clock reads in `timeZone`. Throws on a naive or unparseable instant, or an
 * invalid zone.
 */
export function isoToZonedInput(iso: string, timeZone: string): string {
  if (typeof iso !== 'string' || !INSTANT_RE.test(iso.trim())) {
    throw new RangeError(`Not an ISO instant with Z or an offset: ${JSON.stringify(iso)}`)
  }
  const ms = Date.parse(iso.trim().replace(' ', 'T'))
  if (Number.isNaN(ms)) throw new RangeError(`Unparseable instant: ${JSON.stringify(iso)}`)
  const w = wallClockAt(ms, timeZone)
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

/**
 * A "YYYY-MM-DDTHH:mm[:ss]" wall clock read in `timeZone` → UTC ISO string ending
 * in Z. A wall clock skipped by a spring-forward change moves forward by the size
 * of the gap (02:30 → 03:30 EDT); one repeated by a fall-back change takes the
 * earlier instant. Throws on malformed input or an invalid zone.
 */
export function zonedInputToIso(local: string, timeZone: string): string {
  const m = typeof local === 'string' ? LOCAL_RE.exec(local) : null
  if (!m) throw new RangeError(`Not a YYYY-MM-DDTHH:mm wall clock: ${JSON.stringify(local)}`)
  const [year, month, day, hour, minute, second] = m.slice(1).map(v => (v === undefined ? 0 : Number(v)))

  const wall = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(wall)
  if (
    hour > 23 || minute > 59 || second > 59 ||
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
  ) {
    throw new RangeError(`Not a real calendar date/time: ${JSON.stringify(local)}`)
  }

  // Guess with the offset in force a day either side, then keep the guesses that
  // read back as the same wall clock. No real zone changes offset twice in 48h.
  const DAY = 86_400_000
  const before = offsetAt(wall - DAY, timeZone)
  const after = offsetAt(wall + DAY, timeZone)
  const valid = [wall - before, wall - after].filter(t => offsetAt(t, timeZone) === wall - t)

  let utcMs: number
  if (valid.length > 0) {
    utcMs = Math.min(...valid) // ambiguous → earlier instant
  } else {
    utcMs = wall - before // skipped → the pre-change offset lands just past the gap
  }
  return new Date(utcMs).toISOString()
}

/**
 * A form value → UTC instant. A value that already names its zone (a trailing Z or
 * a ±hh:mm offset, e.g. a GHL-sourced ISO string) is an instant and is returned
 * unchanged; a naive "YYYY-MM-DDTHH:mm[:ss]" is a wall clock read in `timeZone`.
 * Throws on anything else, or an invalid zone.
 */
export function inputToInstant(value: string, timeZone: string): string {
  formatterFor(timeZone)
  if (typeof value === 'string' && INSTANT_RE.test(value.trim())) {
    if (Number.isNaN(Date.parse(value.trim().replace(' ', 'T')))) {
      throw new RangeError(`Unparseable instant: ${JSON.stringify(value)}`)
    }
    return value
  }
  return zonedInputToIso(value, timeZone)
}

/**
 * The instant to store when an edit form re-submits a time it displayed with
 * isoToZonedInput(storedIso, storedTimeZone). An untouched wall clock keeps the
 * stored instant exactly, even when the event's zone changes (the real moment
 * stays fixed; only its display moves). An edited wall clock is read in
 * `targetTimeZone`. A zone-carrying value passes through.
 */
export function resolveEditedInstant(
  submitted: string,
  storedIso: string,
  storedTimeZone: string,
  targetTimeZone: string,
): string {
  if (typeof submitted === 'string' && !INSTANT_RE.test(submitted.trim())) {
    // A browser may submit the displayed "HH:mm" as "HH:mm:00".
    const wall = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(submitted) ? submitted.slice(0, 16) : submitted
    if (wall === isoToZonedInput(storedIso, storedTimeZone)) return storedIso
  }
  return inputToInstant(submitted, targetTimeZone)
}

// ── Dates and display (O109, R89) ────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * The END of a calendar date in `timeZone`: the next day's 00:00 there, minus
 * 1 ms (so "2026-10-06" in New York → 2026-10-07T03:59:59.999Z). Used for
 * "valid until <date>" limits, which must hold through the whole local day.
 */
export function endOfZonedDateIso(date: string, timeZone: string): string {
  const m = typeof date === 'string' ? DATE_RE.exec(date) : null
  if (!m) throw new RangeError(`Not a YYYY-MM-DD date: ${JSON.stringify(date)}`)
  const [year, month, day] = m.slice(1).map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) {
    throw new RangeError(`Not a real calendar date: ${JSON.stringify(date)}`)
  }
  const nextMidnight = `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00`
  return new Date(Date.parse(zonedInputToIso(nextMidnight, timeZone)) - 1).toISOString()
}

/** The calendar date ("YYYY-MM-DD") an instant falls on in `timeZone`. */
export function isoToZonedDate(iso: string, timeZone: string): string {
  return isoToZonedInput(iso, timeZone).slice(0, 10)
}

/** The zone's name as people say it, e.g. "Eastern Time"; UTC is "UTC". */
export function zoneName(timeZone: string, at: number = Date.now()): string {
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC') return 'UTC'
  formatterFor(timeZone)
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longGeneric' })
    .formatToParts(new Date(at)).find(p => p.type === 'timeZoneName')?.value
  return part ?? timeZone
}

/** Short form for inline times: "Eastern", "Pacific" (drops a trailing " Time"). */
export function zoneShortName(timeZone: string, at: number = Date.now()): string {
  return zoneName(timeZone, at).replace(/ Time$/, '')
}

const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}

/** An instant as the wall clock reads in `timeZone`, with the zone named: "Tue, Oct 6, 3:00 PM Eastern Time". */
export function formatInZone(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions = DEFAULT_FORMAT): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return iso
  const text = new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(new Date(ms))
  return `${text} ${zoneName(timeZone, ms)}`
}

/** inputToInstant for an optional form field: empty / missing → null. */
export function optionalInputToInstant(value: string | null | undefined, timeZone: string): string | null {
  if (value == null || value.trim() === '') return null
  return inputToInstant(value.trim(), timeZone)
}

// ── Meeting request proposed times (R89) ─────────────────────────────────────
// A proposed time is stored as the real instant plus the zone it was proposed
// in. Rows written before R89 hold a naive string; those display as-is.

export interface ProposedTime {
  at: string
  tz: string
}

export function isProposedTime(value: unknown): value is ProposedTime {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.at !== 'string' || typeof v.tz !== 'string' || !INSTANT_RE.test(v.at) || Number.isNaN(Date.parse(v.at))) return false
  try { formatterFor(v.tz) } catch { return false }
  return true
}

function dayAndTime(ms: number, timeZone: string): { day: string; time: string } {
  const parts: Record<string, string> = {}
  const f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  for (const p of f.formatToParts(new Date(ms))) parts[p.type] = p.value
  return { day: `${parts.weekday} ${parts.month} ${parts.day}`, time: `${parts.hour}:${parts.minute} ${parts.dayPeriod}` }
}

/**
 * "Tue Oct 6, 3:00 PM Eastern" — plus " — 12:00 PM your time (Pacific)" when
 * the viewer's zone reads the instant differently (the day is added when it
 * differs too). A legacy naive string shows as-is, flagged.
 */
export function formatProposedTime(value: unknown, viewerTimeZone: string | null): string {
  if (typeof value === 'string') return `${value} (time zone not recorded)`
  if (!isProposedTime(value)) return 'Time unavailable'
  const ms = Date.parse(value.at)
  const there = dayAndTime(ms, value.tz)
  const base = `${there.day}, ${there.time} ${zoneShortName(value.tz, ms)}`
  if (!viewerTimeZone) return base
  let viewerValid = true
  try { formatterFor(viewerTimeZone) } catch { viewerValid = false }
  if (!viewerValid) return base
  const here = dayAndTime(ms, viewerTimeZone)
  const sameReading = here.day === there.day && here.time === there.time &&
    zoneShortName(viewerTimeZone, ms) === zoneShortName(value.tz, ms)
  if (sameReading) return base
  const local = here.day === there.day ? here.time : `${here.day}, ${here.time}`
  return `${base} — ${local} your time (${zoneShortName(viewerTimeZone, ms)})`
}
