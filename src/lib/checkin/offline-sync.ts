import { z } from 'zod'
import type { CheckInResult } from '@/lib/checkin/actions'

// R84: shared contract for the event-door offline queue. Both sync routes
// (dashboard and embedded) accept the same batch and return one result per
// entry, keyed by the client-generated entryId — never by QR code.

// A scan older than this at sync time is not trusted as the check-in time.
export const MAX_SCAN_AGE_MS = 72 * 60 * 60 * 1000

// Per request. The device sends larger queues in several requests.
export const MAX_SYNC_ENTRIES = 100

export const SCAN_TIME_CLAMPED_NOTE =
  'Scan time was outside the accepted window; recorded at sync time'

export const OfflineSyncBatchSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().min(1).max(200),
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
}

export interface OfflineSyncResponse {
  processed: number
  total: number
  results: OfflineEntryResult[]
}

// The check-in time for an offline scan: the device's scan time, unless it is
// later than the server's now or more than MAX_SCAN_AGE_MS before it (device
// clock wrong, or a scan too stale to trust), in which case the server's now.
export function clampScanTime(
  scannedAt: string,
  now: Date = new Date(),
): { checkedInAt: string; clamped: boolean } {
  const scanned = Date.parse(scannedAt)
  const nowMs = now.getTime()
  if (Number.isNaN(scanned) || scanned > nowMs || scanned < nowMs - MAX_SCAN_AGE_MS) {
    return { checkedInAt: now.toISOString(), clamped: true }
  }
  return { checkedInAt: new Date(scanned).toISOString(), clamped: false }
}

// Each raw entry → a parsed entry, or a refusal when it at least carries an
// entryId the device can match. Entries with no usable entryId are dropped:
// there is nothing to key a result on.
export function parseOfflineEntries(
  raw: unknown[],
): { valid: OfflineSyncEntry[]; invalid: OfflineEntryResult[] } {
  const valid: OfflineSyncEntry[] = []
  const invalid: OfflineEntryResult[] = []
  for (const item of raw) {
    const parsed = OfflineSyncEntrySchema.safeParse(item)
    if (parsed.success) {
      valid.push(parsed.data)
      continue
    }
    const entryId = (item as { entryId?: unknown } | null)?.entryId
    if (typeof entryId === 'string' && entryId.length > 0 && entryId.length <= 100) {
      invalid.push({ entryId, status: 'refused', reason: 'Invalid queued scan' })
    }
  }
  return { valid, invalid }
}

// A door check-in outcome → the per-entry result the device acts on.
export function offlineResult(entryId: string, r: CheckInResult, clamped: boolean): OfflineEntryResult {
  if (!r.success) return { entryId, status: 'refused', reason: r.error ?? 'Refused' }
  if (r.registration?.already_checked_in) return { entryId, status: 'already_checked_in' }
  return clamped
    ? { entryId, status: 'accepted', note: SCAN_TIME_CLAMPED_NOTE }
    : { entryId, status: 'accepted' }
}
