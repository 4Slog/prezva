import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

// R84: a device that queued scans under the v1 store (boolean `synced`) opens
// the v2 store. Runs in its own file so the database starts at v1.
describe('offline door queue — v1 → v2 upgrade', () => {
  it('maps synced:false → pending and synced:true → synced, and gives every row an entryId', async () => {
    const v1 = new Dexie('prezva-checkin')
    v1.version(1).stores({ pending: '++id, eventId, synced, scannedAt' })
    await v1.table('pending').bulkAdd([
      { eventId: EVENT_ID, qrCode: 'stranded-1', deviceId: 'dev-1', scannedAt: '2026-09-01T10:00:00.000Z', synced: false },
      { eventId: EVENT_ID, qrCode: 'stranded-2', deviceId: 'dev-1', scannedAt: '2026-09-01T10:01:00.000Z', synced: false },
      { eventId: EVENT_ID, qrCode: 'done', deviceId: 'dev-1', scannedAt: '2026-09-01T10:02:00.000Z', synced: true },
    ])
    v1.close()

    const { getOfflineDB, getQueueCounts } = await import('@/lib/checkin/offline-db')
    const rows = await getOfflineDB().pending.orderBy('id').toArray()

    expect(rows.map(r => [r.qrCode, r.status])).toEqual([
      ['stranded-1', 'pending'],
      ['stranded-2', 'pending'],
      ['done', 'synced'],
    ])
    for (const r of rows) {
      expect(r.entryId).toMatch(/^[0-9a-f-]{36}$/)
      expect('synced' in r).toBe(false)
      expect(r.scannedAt).toMatch(/^2026-09-01T10:0/) // the original scan time is kept
    }
    expect(new Set(rows.map(r => r.entryId)).size).toBe(3)
    expect(await getQueueCounts(EVENT_ID)).toEqual({ pending: 2, needsAttention: 0 })
  })
})
