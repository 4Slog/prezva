import Dexie, { type EntityTable } from 'dexie'
import type { OfflineSyncResponse } from '@/lib/checkin/offline-sync'
import { MAX_SYNC_ENTRIES } from '@/lib/checkin/offline-sync'

// R84: queue status is a string, not a boolean. Booleans are not valid
// IndexedDB keys, so the v1 `where({ eventId, synced: false })` matched nothing
// and queued scans never synced.
//   pending         — waiting to be sent
//   needs_attention — the server refused it; `reason` says why
//   synced          — the server accepted it, or it was already checked in
//   dismissed       — staff dismissed a needs_attention entry (kept, not deleted)
export type QueueStatus = 'pending' | 'needs_attention' | 'synced' | 'dismissed'

export interface PendingCheckIn {
  id?: number
  entryId: string
  eventId: string
  qrCode: string
  deviceId: string
  scannedAt: string
  status: QueueStatus
  reason?: string
  syncedAt?: string
}

// Known gap (M3b): one database per browser origin, not per user or event.
class CheckInDB extends Dexie {
  pending!: EntityTable<PendingCheckIn, 'id'>

  constructor() {
    super('prezva-checkin')
    this.version(1).stores({
      pending: '++id, eventId, synced, scannedAt',
    })
    this.version(2)
      .stores({
        pending: '++id, entryId, eventId, status, [eventId+status], scannedAt',
      })
      .upgrade(tx =>
        tx.table('pending').toCollection().modify((row: Record<string, unknown>) => {
          // Every v1 row is a real scan that never reached the server (the v1
          // query could not find it), so unsynced rows become pending and sync.
          row.status = row.synced === true ? 'synced' : 'pending'
          delete row.synced
          if (typeof row.entryId !== 'string') row.entryId = crypto.randomUUID()
        }),
      )
  }
}

let _db: CheckInDB | null = null

export function getOfflineDB(): CheckInDB {
  if (!_db) _db = new CheckInDB()
  return _db
}

function byStatus(eventId: string, status: QueueStatus) {
  return getOfflineDB().pending.where('[eventId+status]').equals([eventId, status])
}

export async function queueCheckIn(eventId: string, qrCode: string, deviceId: string): Promise<PendingCheckIn> {
  const entry: PendingCheckIn = {
    entryId: crypto.randomUUID(),
    eventId,
    qrCode: qrCode.toLowerCase(),
    deviceId,
    scannedAt: new Date().toISOString(),
    status: 'pending',
  }
  entry.id = await getOfflineDB().pending.add(entry)
  return entry
}

export async function getPendingCount(eventId: string): Promise<number> {
  return byStatus(eventId, 'pending').count()
}

export async function getQueueCounts(eventId: string): Promise<{ pending: number; needsAttention: number }> {
  const [pending, needsAttention] = await Promise.all([
    byStatus(eventId, 'pending').count(),
    byStatus(eventId, 'needs_attention').count(),
  ])
  return { pending, needsAttention }
}

export async function listNeedsAttention(eventId: string): Promise<PendingCheckIn[]> {
  return byStatus(eventId, 'needs_attention').sortBy('scannedAt')
}

// Staff acknowledged a refused scan. Only a needs_attention entry can be dismissed.
export async function dismissEntry(id: number): Promise<void> {
  await getOfflineDB().pending
    .where('id').equals(id)
    .and(row => row.status === 'needs_attention')
    .modify({ status: 'dismissed' })
}

export interface SyncOutcome {
  // false: a request failed (network or non-OK) — the entries it carried are unchanged.
  ok: boolean
  synced: number
  needsAttention: number
}

async function syncVia(url: string, eventId: string): Promise<SyncOutcome> {
  const db = getOfflineDB()
  const pending = await byStatus(eventId, 'pending').sortBy('scannedAt')
  const outcome: SyncOutcome = { ok: true, synced: 0, needsAttention: 0 }

  for (let i = 0; i < pending.length; i += MAX_SYNC_ENTRIES) {
    const chunk = pending.slice(i, i + MAX_SYNC_ENTRIES)
    let body: OfflineSyncResponse
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: chunk[0].deviceId,
          entries: chunk.map(p => ({ entryId: p.entryId, qr_code: p.qrCode, scanned_at: p.scannedAt })),
        }),
      })
      if (!res.ok) return { ...outcome, ok: false }
      body = await res.json() as OfflineSyncResponse
    } catch {
      return { ...outcome, ok: false }
    }
    if (!Array.isArray(body?.results)) return { ...outcome, ok: false }

    // Results are matched by entryId only — never by QR code. A result for an
    // entry this request did not carry, or an unknown status, changes nothing.
    const sent = new Map(chunk.map(p => [p.entryId, p]))
    const syncedAt = new Date().toISOString()
    await db.transaction('rw', db.pending, async () => {
      for (const r of body.results) {
        const row = sent.get(r?.entryId)
        if (!row?.id) continue
        sent.delete(r.entryId)
        if (r.status === 'accepted' || r.status === 'already_checked_in') {
          await db.pending.update(row.id, { status: 'synced', syncedAt })
          outcome.synced++
        } else if (r.status === 'refused') {
          await db.pending.update(row.id, {
            status: 'needs_attention',
            reason: typeof r.reason === 'string' && r.reason ? r.reason : 'Refused by the server',
          })
          outcome.needsAttention++
        }
      }
    })
  }
  return outcome
}

export function syncPending(eventId: string): Promise<SyncOutcome> {
  return syncVia(`/api/events/${eventId}/checkin/sync`, eventId)
}

// Embed variant — calls the embed-authed sync endpoint (session cookie, no user session required)
export function syncPendingEmbed(eventId: string): Promise<SyncOutcome> {
  return syncVia(`/api/embedded/events/${eventId}/checkin/sync`, eventId)
}
