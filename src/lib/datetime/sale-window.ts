import { formatInZone, zoneShortName } from '@/lib/datetime/zoned-input'

// O136: a ticket's sale window, read in the EVENT's zone (not the viewer's).
//   always     — no start, no end: nothing to show
//   upcoming   — starts in the future: "Sales open Oct 6, 9:00 AM Eastern Time"
//                (with an end: "Sales open Oct 6, 9:00 AM – Oct 10, 5:00 PM Eastern")
//   open_until — on sale now, with an end: "On sale until Oct 10, 5:00 PM Eastern Time"
//   open       — on sale now, no end: "On sale since Oct 1, 9:00 AM Eastern Time"
//   ended      — the end has passed: "Sales ended Oct 10, 5:00 PM Eastern Time"
export type SaleWindowState = 'always' | 'upcoming' | 'open_until' | 'open' | 'ended'

const WHEN: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }

function validZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC'
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return 'UTC' }
}

export function formatSaleWindow(
  start: string | null | undefined,
  end: string | null | undefined,
  eventTz: string | null | undefined,
  now: number = Date.now(),
): { state: SaleWindowState; label: string | null } {
  const tz = validZone(eventTz)
  const startMs = start ? Date.parse(start) : NaN
  const endMs = end ? Date.parse(end) : NaN
  const hasStart = !Number.isNaN(startMs)
  const hasEnd = !Number.isNaN(endMs)
  const at = (iso: string) => formatInZone(iso, tz, WHEN)

  if (hasEnd && endMs <= now) return { state: 'ended', label: `Sales ended ${at(end!)}` }
  if (hasStart && startMs > now) {
    if (!hasEnd) return { state: 'upcoming', label: `Sales open ${at(start!)}` }
    const clock = (ms: number) => new Intl.DateTimeFormat('en-US', { ...WHEN, timeZone: tz }).format(new Date(ms))
    return { state: 'upcoming', label: `Sales open ${clock(startMs)} – ${clock(endMs)} ${zoneShortName(tz, endMs)}` }
  }
  if (hasEnd) return { state: 'open_until', label: `On sale until ${at(end!)}` }
  if (hasStart) return { state: 'open', label: `On sale since ${at(start!)}` }
  return { state: 'always', label: null }
}
