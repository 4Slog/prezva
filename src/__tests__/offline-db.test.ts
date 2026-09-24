import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getOfflineDB,
  queueCheckIn,
  getPendingCount,
  getQueueCounts,
  listNeedsAttention,
  dismissEntry,
  syncPending,
  syncPendingEmbed,
} from '@/lib/checkin/offline-db'
import type { OfflineEntryResult } from '@/lib/checkin/offline-sync'

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const OTHER_EVENT = 'f1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

type SentEntry = { entryId: string; qr_code: string; scanned_at: string }

// A fake sync endpoint: `decide` returns each entry's result.
function stubServer(decide: (e: SentEntry) => OfflineEntryResult | null) {
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { deviceId: string; entries: SentEntry[] }
    const results = body.entries.map(decide).filter((r): r is OfflineEntryResult => r !== null)
    return new Response(JSON.stringify({ processed: 0, total: body.entries.length, results }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentEntries(fetchMock: ReturnType<typeof vi.fn>, call = 0): SentEntry[] {
  return JSON.parse(String((fetchMock.mock.calls[call][1] as RequestInit).body)).entries
}

beforeEach(async () => {
  await getOfflineDB().pending.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('offline door queue — pending query (R84)', () => {
  it('a queued scan is found as pending for its event', async () => {
    // Failed on the v1 store: where({ eventId, synced: false }) → 0 of 1.
    await queueCheckIn(EVENT_ID, 'PREZVA-A', 'dev-1')
    expect(await getPendingCount(EVENT_ID)).toBe(1)
  })

  it('counts pending per event and needs_attention separately', async () => {
    await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    const b = await queueCheckIn(EVENT_ID, 'b', 'dev-1')
    await queueCheckIn(OTHER_EVENT, 'c', 'dev-1')
    await getOfflineDB().pending.update(b.id!, { status: 'needs_attention', reason: 'x' })
    expect(await getQueueCounts(EVENT_ID)).toEqual({ pending: 1, needsAttention: 1 })
    expect(await getQueueCounts(OTHER_EVENT)).toEqual({ pending: 1, needsAttention: 0 })
  })

  it('every entry gets a client-generated entryId and a lowercased code', async () => {
    const a = await queueCheckIn(EVENT_ID, 'PREZVA-A', 'dev-1')
    const b = await queueCheckIn(EVENT_ID, 'PREZVA-A', 'dev-1')
    expect(a.entryId).toMatch(/^[0-9a-f-]{36}$/)
    expect(a.entryId).not.toBe(b.entryId)
    expect(a.qrCode).toBe('prezva-a')
    expect(a.status).toBe('pending')
  })
})

describe('offline door sync — per-entry results (R84)', () => {
  it('sends entryId, qr_code and scanned_at for each pending entry', async () => {
    const e = await queueCheckIn(EVENT_ID, 'PREZVA-A', 'dev-1')
    const fetchMock = stubServer(x => ({ entryId: x.entryId, status: 'accepted' }))
    await syncPending(EVENT_ID)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/events/${EVENT_ID}/checkin/sync`)
    expect(sentEntries(fetchMock)).toEqual([{ entryId: e.entryId, qr_code: 'prezva-a', scanned_at: e.scannedAt }])
  })

  it('accepted and already_checked_in → synced; refused → needs_attention with the reason', async () => {
    const ok = await queueCheckIn(EVENT_ID, 'ok', 'dev-1')
    const dup = await queueCheckIn(EVENT_ID, 'dup', 'dev-1')
    const cancelled = await queueCheckIn(EVENT_ID, 'cancelled', 'dev-1')
    const unknown = await queueCheckIn(EVENT_ID, 'unknown', 'dev-1')
    stubServer(x => {
      if (x.qr_code === 'ok') return { entryId: x.entryId, status: 'accepted' }
      if (x.qr_code === 'dup') return { entryId: x.entryId, status: 'already_checked_in' }
      if (x.qr_code === 'cancelled') return { entryId: x.entryId, status: 'refused', reason: 'Registration is cancelled' }
      return { entryId: x.entryId, status: 'refused', reason: 'QR code not found for this event' }
    })
    const outcome = await syncPending(EVENT_ID)
    expect(outcome).toEqual({ ok: true, synced: 2, needsAttention: 2 })

    const rows = new Map((await getOfflineDB().pending.toArray()).map(r => [r.entryId, r]))
    expect(rows.get(ok.entryId)!.status).toBe('synced')
    expect(rows.get(dup.entryId)!.status).toBe('synced')
    expect(rows.get(cancelled.entryId)).toMatchObject({ status: 'needs_attention', reason: 'Registration is cancelled' })
    expect(rows.get(unknown.entryId)).toMatchObject({ status: 'needs_attention', reason: 'QR code not found for this event' })

    const attention = await listNeedsAttention(EVENT_ID)
    expect(attention.map(a => a.entryId).sort()).toEqual([cancelled.entryId, unknown.entryId].sort())
  })

  it('one bad entry does not block the rest', async () => {
    await queueCheckIn(EVENT_ID, 'good-1', 'dev-1')
    await queueCheckIn(EVENT_ID, 'bad', 'dev-1')
    await queueCheckIn(EVENT_ID, 'good-2', 'dev-1')
    stubServer(x => x.qr_code === 'bad'
      ? { entryId: x.entryId, status: 'refused', reason: 'Registration was refunded' }
      : { entryId: x.entryId, status: 'accepted' })
    await syncPending(EVENT_ID)
    expect(await getQueueCounts(EVENT_ID)).toEqual({ pending: 0, needsAttention: 1 })
  })

  it('a refused entry is not re-sent on the next sync', async () => {
    const bad = await queueCheckIn(EVENT_ID, 'bad', 'dev-1')
    const fetchMock = stubServer(x => ({ entryId: x.entryId, status: 'refused', reason: 'Registration is cancelled' }))
    await syncPending(EVENT_ID)
    expect(sentEntries(fetchMock, 0).map(e => e.entryId)).toEqual([bad.entryId])

    const later = await queueCheckIn(EVENT_ID, 'later', 'dev-1')
    await syncPending(EVENT_ID)
    expect(sentEntries(fetchMock, 1).map(e => e.entryId)).toEqual([later.entryId])
  })

  it('results are matched by entryId, never by QR code', async () => {
    // The same code scanned twice: one accepted, the second refused.
    const first = await queueCheckIn(EVENT_ID, 'same', 'dev-1')
    const second = await queueCheckIn(EVENT_ID, 'same', 'dev-1')
    stubServer(x => x.entryId === first.entryId
      ? { entryId: x.entryId, status: 'accepted' }
      : { entryId: x.entryId, status: 'refused', reason: 'nope' })
    await syncPending(EVENT_ID)
    const rows = new Map((await getOfflineDB().pending.toArray()).map(r => [r.entryId, r]))
    expect(rows.get(first.entryId)!.status).toBe('synced')
    expect(rows.get(second.entryId)!.status).toBe('needs_attention')
  })

  it('an entry with no result, a retry, or a result for an unknown entryId stays pending', async () => {
    const a = await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    const b = await queueCheckIn(EVENT_ID, 'b', 'dev-1')
    stubServer(x => {
      if (x.entryId === a.entryId) return { entryId: x.entryId, status: 'retry', reason: 'Server error' }
      return { entryId: 'not-sent', status: 'accepted' }
    })
    await syncPending(EVENT_ID)
    const rows = await getOfflineDB().pending.toArray()
    expect(rows.map(r => r.status)).toEqual(['pending', 'pending'])
    expect(rows.map(r => r.entryId).sort()).toEqual([a.entryId, b.entryId].sort())
  })

  it('a non-OK response changes nothing on the device', async () => {
    await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'No embed session' }), { status: 400 })))
    const outcome = await syncPendingEmbed(EVENT_ID)
    expect(outcome.ok).toBe(false)
    expect(await getQueueCounts(EVENT_ID)).toEqual({ pending: 1, needsAttention: 0 })
  })

  it('a network failure changes nothing on the device', async () => {
    await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const outcome = await syncPending(EVENT_ID)
    expect(outcome.ok).toBe(false)
    expect(await getQueueCounts(EVENT_ID)).toEqual({ pending: 1, needsAttention: 0 })
  })

  it('a 200 that is not a results payload (e.g. a login page) changes nothing', async () => {
    await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { status: 200 })))
    const outcome = await syncPending(EVENT_ID)
    expect(outcome.ok).toBe(false)
    expect(await getPendingCount(EVENT_ID)).toBe(1)
  })

  it('the embed sync uses the embedded endpoint', async () => {
    await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    const fetchMock = stubServer(x => ({ entryId: x.entryId, status: 'accepted' }))
    await syncPendingEmbed(EVENT_ID)
    expect(fetchMock.mock.calls[0][0]).toBe(`/api/embedded/events/${EVENT_ID}/checkin/sync`)
  })
})

describe('needs attention — dismiss (R84)', () => {
  it('dismiss marks the entry dismissed (not deleted) and drops it from the list', async () => {
    const e = await queueCheckIn(EVENT_ID, 'bad', 'dev-1')
    stubServer(x => ({ entryId: x.entryId, status: 'refused', reason: 'Registration is cancelled' }))
    await syncPending(EVENT_ID)
    await dismissEntry(e.id!)
    const row = await getOfflineDB().pending.get(e.id!)
    expect(row!.status).toBe('dismissed')
    expect(await listNeedsAttention(EVENT_ID)).toHaveLength(0)
    expect(await getQueueCounts(EVENT_ID)).toEqual({ pending: 0, needsAttention: 0 })
  })

  it('a pending entry cannot be dismissed', async () => {
    const e = await queueCheckIn(EVENT_ID, 'a', 'dev-1')
    await dismissEntry(e.id!)
    expect((await getOfflineDB().pending.get(e.id!))!.status).toBe('pending')
  })
})

describe('offline door sync — synced entries drop the scanned code (O125)', () => {
  it('synced entries lose qrCode; needs_attention keeps it for staff', async () => {
    const ok = await queueCheckIn(EVENT_ID, 'ok', 'dev-1')
    const bad = await queueCheckIn(EVENT_ID, 'bad', 'dev-1')
    stubServer(x => x.qr_code === 'bad'
      ? { entryId: x.entryId, status: 'refused', reason: 'nope' }
      : { entryId: x.entryId, status: 'accepted' })
    await syncPending(EVENT_ID)
    const rows = new Map((await getOfflineDB().pending.toArray()).map(r => [r.entryId, r]))
    expect(rows.get(ok.entryId)!.status).toBe('synced')
    expect(rows.get(ok.entryId)).not.toHaveProperty('qrCode')
    expect(rows.get(bad.entryId)).toMatchObject({ status: 'needs_attention', qrCode: 'bad' })
  })
})
