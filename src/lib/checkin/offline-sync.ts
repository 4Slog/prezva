import { z } from 'zod'
import type { CheckInResult } from '@/lib/checkin/actions'

// R84: shared contract for the event-door offline queue. Both sync routes
// (dashboard and embedded) accept the same batch and return one result per
// entry, keyed by the client-generated entryId — never by QR code.

// A scan more than this before the server's now (after clock-skew correction)
// is refused for review rather than recorded.
export const MAX_SCAN_AGE_MS = 72 * 60 * 60 * 1000

// Per request. The device sends larger queues in several requests.
export const MAX_SYNC_ENTRIES = 100

export const SCAN_TIME_CLAMPED_NOTE =
  'Scan time was outside the accepted window; recorded at the nearest accepted time'

export const STALE_SCAN_REASON = 'Scan is more than 72 hours old; review it'

export const OfflineSyncBatchSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().min(1).max(200),
  // The device's clock when it sent the batch (ISO). Used to correct each scan
  // time for device clock skew; missing or unparseable means no correction.
  deviceNow: z.string().max(100).optional(),
  // Entries are validated one by one so a single malformed entry cannot fail
  // the batch.
  entries: z.array(z.unknown()).max(MAX_SYNC_ENTRIES),
})

export const OfflineSyncEntrySchema = z.object({
  entryId: z.string().uuid(),
  qr_code: z.string().min(1).max(500),
  scanned_at: z.string().max(100),
})

export type OfflineSyncEntry = z.infer<typeof OfflineSyncEntrySchema>

// accepted / already_checked_in → the device marks the entry synced.
// refused → the device moves it to needs_attention with the reason.
// retry   → a server-side failure; the device leaves the entry pending.
export type OfflineEntryStatus = 'accepted' | 'already_checked_in' | 'refused' | 'retry'

export interface OfflineEntryResult {
  entryId: string
  status: OfflineEntryStatus
  reason?: string
  // Set when the scan time could not be used as the check-in time.
  note?: string
  // Session sync only: the entry kind the device sent, echoed back.
  kind?: string
}

export interface OfflineSyncResponse {
  processed: number
  total: number
  results: OfflineEntryResult[]
}

export type ScanTimeResult =
  | { ok: true; checkedInAt: string; clamped: boolean; clientScannedAt: string | null }
  | { ok: false; reason: string; clientScannedAt: string | null }

// The check-in time for an offline scan (R84 + the stale-scan rule), shared by
// the door and session syncs:
//   1. Skew: when the batch carries a parseable deviceNow, the scan time is
//      shifted by (serverNow - deviceNow).
//   2. Stale: a corrected time more than MAX_SCAN_AGE_MS before serverNow is
//      REFUSED for review, never recorded.
//   3. Clamp: a corrected time later than serverNow (device clock ahead) is
//      recorded at serverNow; one earlier than `floor` (the staff grant's issue
//      time minus 5 minutes, session sync only) is recorded at the floor.
// An unparseable scan time is recorded at serverNow, as before.
// clientScannedAt is the device's RAW scan time (uncorrected), or null when it
// does not parse.
export function resolveScanTime(
  scannedAt: string,
  opts: { now?: Date; deviceNow?: string | null; floor?: Date | null } = {},
): ScanTimeResult {
  const nowMs = (opts.now ?? new Date()).getTime()
  const scanned = Date.parse(scannedAt)
  if (Number.isNaN(scanned)) {
    return { ok: true, checkedInAt: new Date(nowMs).toISOString(), clamped: true, clientScannedAt: null }
  }
  const clientScannedAt = new Date(scanned).toISOString()
  const deviceNow = opts.deviceNow ? Date.parse(opts.deviceNow) : NaN
  const corrected = Number.isNaN(deviceNow) ? scanned : scanned + (nowMs - deviceNow)

  if (corrected < nowMs - MAX_SCAN_AGE_MS) return { ok: false, reason: STALE_SCAN_REASON, clientScannedAt }
  if (corrected > nowMs) {
    return { ok: true, checkedInAt: new Date(nowMs).toISOString(), clamped: true, clientScannedAt }
  }
  const floorMs = opts.floor?.getTime()
  if (floorMs !== undefined && corrected < floorMs) {
    return { ok: true, checkedInAt: new Date(Math.min(floorMs, nowMs)).toISOString(), clamped: true, clientScannedAt }
  }
  return { ok: true, checkedInAt: new Date(corrected).toISOString(), clamped: false, clientScannedAt }
}

// Each raw entry → a parsed entry, or a refusal when it at least carries an
// entryId the device can match. Entries with no usable entryId are dropped:
// there is nothing to key a result on.
export function parseEntries<T>(
  raw: unknown[],
  schema: z.ZodType<T>,
): { valid: T[]; invalid: OfflineEntryResult[] } {
  const valid: T[] = []
  const invalid: OfflineEntryResult[] = []
  for (const item of raw) {
    const parsed = schema.safeParse(item)
    if (parsed.success) {
      valid.push(parsed.data)
      continue
    }
    const entryId = entryIdOf(item)
    if (entryId) invalid.push({ entryId, status: 'refused', reason: 'Invalid queued scan' })
  }
  return { valid, invalid }
}

// The entryId a raw entry carries, if it is usable as a result key.
export function entryIdOf(item: unknown): string | null {
  const entryId = (item as { entryId?: unknown } | null)?.entryId
  return typeof entryId === 'string' && entryId.length > 0 && entryId.length <= 100 ? entryId : null
}

export function parseOfflineEntries(
  raw: unknown[],
): { valid: OfflineSyncEntry[]; invalid: OfflineEntryResult[] } {
  return parseEntries(raw, OfflineSyncEntrySchema)
}

// Postgres unique_violation: a replayed client_entry_id (both syncs) or the
// (registration_id, session_id) key (session sync) — already recorded.
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return error?.code === '23505'
}

// A door check-in outcome → the per-entry result the device acts on.
export function offlineResult(entryId: string, r: CheckInResult, clamped: boolean): OfflineEntryResult {
  if (!r.success) return { entryId, status: 'refused', reason: r.error ?? 'Refused' }
  if (r.registration?.already_checked_in) return { entryId, status: 'already_checked_in' }
  return clamped
    ? { entryId, status: 'accepted', note: SCAN_TIME_CLAMPED_NOTE }
    : { entryId, status: 'accepted' }
}

// ── Session sync contract (M3b) ──────────────────────────────────────────────

export const SessionSyncBatchSchema = z.object({
  deviceId: z.string().min(1).max(200),
  deviceNow: z.string().max(100).optional(),
  grant: z.string().min(1).max(4000),
  // Validated one by one so a single malformed entry cannot fail the batch.
  entries: z.array(z.unknown()).max(MAX_SYNC_ENTRIES),
})

const entryBase = { entryId: z.string().uuid(), scannedAt: z.string().max(100) }

// scan / recheck carry the raw scanned text and are processed identically (a
// recheck is an unknown-offline token queued for re-validation, R85); manual /
// override carry a registration id.
export const SessionSyncEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scan'), ...entryBase, token: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('recheck'), ...entryBase, token: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('manual'), ...entryBase, registrationId: z.string().uuid() }),
  z.object({ kind: z.literal('override'), ...entryBase, registrationId: z.string().uuid() }),
])

export type SessionSyncEntry = z.infer<typeof SessionSyncEntrySchema>

export const SESSION_NOT_FOUND_REASON = 'Session not found for this event'

// A batch-level outcome the route turns into a non-200. session_expired → 401:
// the device keeps every entry pending and tells staff to reopen the page.
export interface SessionSyncFailure {
  error: string
  code?: 'session_expired'
  status: 400 | 401 | 403
}
