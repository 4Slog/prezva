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
