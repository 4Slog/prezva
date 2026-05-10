import Dexie, { type EntityTable } from 'dexie'

export interface PendingCheckIn {
  id?: number
  eventId: string
  qrCode: string
  deviceId: string
  scannedAt: string
  synced: boolean
}

class CheckInDB extends Dexie {
  pending!: EntityTable<PendingCheckIn, 'id'>

  constructor() {
    super('prezva-checkin')
    this.version(1).stores({
      pending: '++id, eventId, synced, scannedAt',
    })
  }
}

let _db: CheckInDB | null = null

export function getOfflineDB(): CheckInDB {
  if (!_db) _db = new CheckInDB()
  return _db
}

export async function queueCheckIn(eventId: string, qrCode: string, deviceId: string) {
  const db = getOfflineDB()
  await db.pending.add({
    eventId,
    qrCode,
    deviceId,
    scannedAt: new Date().toISOString(),
    synced: false,
  })
}

export async function getPendingCount(eventId: string): Promise<number> {
  const db = getOfflineDB()
  return db.pending.where({ eventId, synced: false }).count()
}

export async function syncPending(eventId: string): Promise<{ processed: number; failed: number }> {
  const db = getOfflineDB()
  const pending = await db.pending
    .where({ eventId, synced: false })
    .toArray()

  if (pending.length === 0) return { processed: 0, failed: 0 }

  const deviceId = pending[0].deviceId
  const res = await fetch(`/api/events/${eventId}/checkin/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      entries: pending.map(p => ({ qr_code: p.qrCode, scanned_at: p.scannedAt })),
    }),
  })

  if (!res.ok) return { processed: 0, failed: pending.length }

  const result = await res.json() as { processed: number; total: number; errors: string[] }
  const ids = pending.map(p => p.id!)
  await db.pending.where('id').anyOf(ids).modify({ synced: true })

  return { processed: result.processed, failed: result.errors.length }
}
