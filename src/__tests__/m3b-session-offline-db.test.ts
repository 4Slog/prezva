import 'fake-indexeddb/auto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'

// M3b-B — the session device store: naming and scoping, the hash contract, pack
// lifecycle, the queue, and sync result handling.

import {
  scanDbName,
  openScanDb,
  hashScan,
  savePack,
  getPackState,
  clearFinishedEvents,
  findByScan,
  enqueue,
  queueSummary,
  dismissQueueEntry,
  syncSessionQueue,
  listScanDbNames,
  countPendingEverywhere,
  deleteAllScanDbs,
  isCheckedInLocally,
  PACK_MAX_AGE_MS,
  type SessionScanDB,
} from '@/lib/checkin/session-offline-db'
import type { OfflineSessionPack } from '@/lib/checkin/offline-pack'

const EVENT_A = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const EVENT_B = 'e2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION = '5e551000-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG = '11111111-1111-4111-8111-111111111111'
const QR = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const GHL = 'abcdefabcdefabcdefabcdef'
const ghlToken = (id: string) => `v1.${id}.${'A'.repeat(43)}`
const sha = (v: string) => createHash('sha256').update(v.toLowerCase()).digest('hex')

function fakeGrant(expMs: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256' })}.${b64({ exp: Math.floor(expMs / 1000) })}.sig`
}

function pack(over: Partial<OfflineSessionPack> = {}): OfflineSessionPack {
  return {
    serverNow: new Date().toISOString(),
    grant: fakeGrant(Date.now() + 3600_000),
    eventEndsAt: new Date(Date.now() + 3600_000).toISOString(),
    attendees: [{
      registrationId: REG, name: 'Ada Lovelace', email: 'ada@test.com', ticketName: 'General',
      ghlIdHash: sha(GHL), qrHash: sha(QR), checkedInAt: null,
    }],
    ...over,
  }
}

let db: SessionScanDB

beforeEach(async () => {
  await deleteAllScanDbs()
  db = openScanDb(await scanDbName('dashboard', 'user-1', EVENT_A))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('database naming and scoping', () => {
  it('is prezva-scan:{surface}:{16-hex scope}:{eventId}', async () => {
    const name = await scanDbName('dashboard', 'user-1', EVENT_A)
    expect(name).toBe(`prezva-scan:dashboard:${sha('user-1').slice(0, 16)}:${EVENT_A}`)
  })

  it('two staff and two events get four separate databases', async () => {
    const names = await Promise.all([
      scanDbName('dashboard', 'user-1', EVENT_A),
      scanDbName('dashboard', 'user-2', EVENT_A),
      scanDbName('dashboard', 'user-1', EVENT_B),
      scanDbName('dashboard', 'user-2', EVENT_B),
    ])
    expect(new Set(names).size).toBe(4)
  })

  it('embedded scopes by the lowercased email; no email is anon', async () => {
    expect(await scanDbName('embed', 'Door@Org.test', EVENT_A)).toBe(await scanDbName('embed', 'door@org.test', EVENT_A))
    expect(await scanDbName('embed', 'door@org.test', EVENT_A)).toContain(`:${sha('door@org.test').slice(0, 16)}:`)
    expect(await scanDbName('embed', null, EVENT_A)).toBe(`prezva-scan:embed:anon:${EVENT_A}`)
  })

  it('entries in one staff member\'s database are invisible to another', async () => {
    await savePack(db, SESSION, pack())
    await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: REG })
    const other = openScanDb(await scanDbName('dashboard', 'user-2', EVENT_A))
    expect((await queueSummary(other, SESSION)).pending).toBe(0)
    expect(await findByScan(other, SESSION, QR)).toBeNull()
  })
})

describe('hash contract (SHA-256 hex of the lowercased value)', () => {
  it('a GHL token hashes its attendee id', async () => {
    expect(await hashScan(ghlToken(GHL.toUpperCase()))).toEqual({ field: 'ghlIdHash', hash: sha(GHL) })
  })
  it('a Prezva QR hashes the lowercased code', async () => {
    expect(await hashScan(QR.toUpperCase())).toEqual({ field: 'qrHash', hash: sha(QR) })
  })
  it('anything else hashes the raw text lowercased', async () => {
    expect(await hashScan('Manual-Code-7')).toEqual({ field: 'qrHash', hash: sha('manual-code-7') })
  })
  it('a GHL token and a Prezva QR match the list; a non-matching value does not', async () => {
    await savePack(db, SESSION, pack())
    expect((await findByScan(db, SESSION, ghlToken(GHL)))?.registrationId).toBe(REG)
    expect((await findByScan(db, SESSION, QR))?.registrationId).toBe(REG)
    expect(await findByScan(db, SESSION, ghlToken('0123456789abcdef01234567'))).toBeNull()
    expect(await findByScan(db, SESSION, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBeNull()
  })
})

describe('pack lifecycle', () => {
  it('ready after a save; records the server offset', async () => {
    const now = Date.now()
    await savePack(db, SESSION, pack({ serverNow: new Date(now + 60_000).toISOString() }), now)
    const state = await getPackState(db, SESSION, now)
    expect(state.state).toBe('ready')
    if (state.state === 'ready') expect(state.meta.serverOffsetMs).toBe(60_000)
  })

  it('stale once fetchedAt is 24h old', async () => {
    const now = Date.now()
    await savePack(db, SESSION, pack({ grant: fakeGrant(now + 7 * 86400_000) }), now - PACK_MAX_AGE_MS - 1)
    expect((await getPackState(db, SESSION, now)).state).toBe('stale')
  })

  it('expired when the grant has expired (event ended > 24h ago)', async () => {
    await savePack(db, SESSION, pack({ grant: fakeGrant(Date.now() - 1000) }))
    expect((await getPackState(db, SESSION)).state).toBe('expired')
  })

  it('none before any pack', async () => {
    expect((await getPackState(db, SESSION)).state).toBe('none')
  })

  it('eventEndsAt + 24h clears the list and meta but never the pending queue', async () => {
    const ended = new Date(Date.now() - 25 * 3600_000).toISOString()
    await savePack(db, SESSION, pack({ eventEndsAt: ended }))
    await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: REG })
    await clearFinishedEvents(db)
    expect(await db.list.count()).toBe(0)
    expect(await db.meta.count()).toBe(0)
    expect((await queueSummary(db, SESSION)).pending).toBe(1)
  })

  it('does not clear before eventEndsAt + 24h', async () => {
    await savePack(db, SESSION, pack({ eventEndsAt: new Date(Date.now() - 23 * 3600_000).toISOString() }))
    await clearFinishedEvents(db)
    expect(await db.list.count()).toBe(1)
  })
})

describe('queue', () => {
  it('queueing marks the attendee in on this device; a recheck does not', async () => {
    await savePack(db, SESSION, pack())
    await enqueue(db, { sessionId: SESSION, kind: 'recheck', token: 'x' })
    expect(await isCheckedInLocally(db, SESSION, REG)).toBe(false)
    await enqueue(db, { sessionId: SESSION, kind: 'scan', token: QR, registrationId: REG })
    expect(await isCheckedInLocally(db, SESSION, REG)).toBe(true)
    const s = await queueSummary(db, SESSION)
    expect(s).toEqual(expect.objectContaining({ pending: 2, pendingVerification: 1 }))
  })

  it('dismiss marks dismissed and deletes the token', async () => {
    const row = await enqueue(db, { sessionId: SESSION, kind: 'recheck', token: 'secret-token' })
    await db.queue.update(row.entryId, { status: 'needs_attention', reason: 'nope' })
    await dismissQueueEntry(db, row.entryId)
    const after = await db.queue.get(row.entryId)
    expect(after?.status).toBe('dismissed')
    expect(after).not.toHaveProperty('token')
  })
})

describe('syncSessionQueue', () => {
  const url = '/api/events/e/sessions/s/checkin/sync'
  type Sent = { deviceId: string; deviceNow: string; grant: string; entries: { entryId: string; kind: string }[] }
  let sent: Sent[]

  function respond(fn: (body: Sent) => { status?: number; json: unknown }) {
    sent = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Sent
      sent.push(body)
      const r = fn(body)
      return new Response(JSON.stringify(r.json), { status: r.status ?? 200 })
    }))
  }

  async function seed(n: number, kind: 'scan' | 'recheck' | 'manual' = 'scan') {
    await savePack(db, SESSION, pack())
    const rows = []
    for (let i = 0; i < n; i++) {
      rows.push(await enqueue(db, {
        sessionId: SESSION, kind, token: kind === 'manual' ? undefined : `token-${i}`,
        registrationId: kind === 'manual' ? REG : undefined, grant: 'g-1',
      }))
    }
    return rows
  }

  it('accepted / already → synced with the token deleted; refused → needs_attention; retry → pending', async () => {
    const [a, b, c, d] = await seed(4)
    const statuses: Record<string, object> = {
      [a.entryId]: { status: 'accepted' },
      [b.entryId]: { status: 'already_checked_in' },
      [c.entryId]: { status: 'refused', reason: "This GHL ticket isn't registered for this event" },
      [d.entryId]: { status: 'retry', reason: 'Server error' },
    }
    respond(body => ({ json: { processed: 1, total: 4, results: body.entries.map(e => ({ entryId: e.entryId, ...statuses[e.entryId] })) } }))
    const out = await syncSessionQueue(db, { url, sessionId: SESSION, deviceId: 'dev-1' })
    expect(out).toEqual({ ok: true, synced: 2, needsAttention: 1, sessionExpired: false })
    const rows = await db.queue.toArray()
    const by = new Map(rows.map(r => [r.entryId, r]))
    expect(by.get(a.entryId)).toEqual(expect.objectContaining({ status: 'synced' }))
    expect(by.get(a.entryId)).not.toHaveProperty('token')
    expect(by.get(b.entryId)).not.toHaveProperty('token')
    expect(by.get(c.entryId)).toEqual(expect.objectContaining({ status: 'needs_attention', reason: "This GHL ticket isn't registered for this event" }))
    expect(by.get(d.entryId)).toEqual(expect.objectContaining({ status: 'pending', token: 'token-3' }))
  })

  it('sends deviceId, deviceNow and the entry\'s grant; kinds carry token or registrationId', async () => {
    await seed(1, 'recheck')
    await seed(1, 'manual')
    respond(body => ({ json: { processed: 0, total: body.entries.length, results: [] } }))
    await syncSessionQueue(db, { url, sessionId: SESSION, deviceId: 'dev-1' })
    expect(sent).toHaveLength(1)
    expect(sent[0].deviceId).toBe('dev-1')
    expect(sent[0].grant).toBe('g-1')
    expect(Math.abs(Date.parse(sent[0].deviceNow) - Date.now())).toBeLessThan(5_000)
    expect(sent[0].entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'recheck', token: 'token-0' }),
      expect.objectContaining({ kind: 'manual', registrationId: REG }),
    ]))
  })

  it('sends at most 100 entries per request', async () => {
    await seed(150)
    respond(body => ({ json: { processed: 0, total: body.entries.length, results: [] } }))
    await syncSessionQueue(db, { url, sessionId: SESSION, deviceId: 'dev-1' })
    expect(sent.map(s => s.entries.length)).toEqual([100, 50])
  })

  it('a non-200 leaves everything pending', async () => {
    await seed(2)
    respond(() => ({ status: 500, json: { error: 'Sync failed' } }))
    const out = await syncSessionQueue(db, { url, sessionId: SESSION, deviceId: 'dev-1' })
    expect(out.ok).toBe(false)
    expect((await queueSummary(db, SESSION)).pending).toBe(2)
  })

  it('401 session_expired leaves everything pending and says so', async () => {
    await seed(2)
    respond(() => ({ status: 401, json: { error: 'Session expired; reopen the page', code: 'session_expired' } }))
    const out = await syncSessionQueue(db, { url, sessionId: SESSION, deviceId: 'dev-1' })
    expect(out).toEqual(expect.objectContaining({ ok: false, sessionExpired: true }))
    expect((await queueSummary(db, SESSION)).pending).toBe(2)
  })

  it('a network failure leaves everything pending', async () => {
    await seed(1)
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const out = await syncSessionQueue(db, { url, sessionId: SESSION, deviceId: 'dev-1' })
    expect(out.ok).toBe(false)
    expect((await queueSummary(db, SESSION)).pending).toBe(1)
  })
})

describe('sign-out helpers', () => {
  it('count pending across every scan database, then delete them all', async () => {
    await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: REG })
    const other = openScanDb(await scanDbName('embed', 'door@org.test', EVENT_B))
    await enqueue(other, { sessionId: SESSION, kind: 'recheck', token: 't' })
    expect(await countPendingEverywhere()).toBe(2)
    expect((await listScanDbNames()).length).toBeGreaterThanOrEqual(2)
    await deleteAllScanDbs()
    expect(await listScanDbNames()).toEqual([])
    expect(await countPendingEverywhere()).toBe(0)
  })
})

describe('O125 stale device queue', () => {
  it('a list row with checkedInAt null plus an old SYNCED entry is not locally checked in', async () => {
    await savePack(db, SESSION, pack())
    const row = await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: REG })
    await db.queue.update(row.entryId, { status: 'synced' })
    // The server list says not checked in (e.g. the check-in was undone).
    await db.list.update([SESSION, REG], { checkedInAt: null })
    expect(await isCheckedInLocally(db, SESSION, REG)).toBe(false)
  })

  it('a PENDING entry is locally checked in', async () => {
    await savePack(db, SESSION, pack())
    await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: REG })
    await db.list.update([SESSION, REG], { checkedInAt: null })
    expect(await isCheckedInLocally(db, SESSION, REG)).toBe(true)
  })

  it('a successful list refresh deletes this session\'s synced entries only', async () => {
    const OTHER = '5e552000-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
    await savePack(db, SESSION, pack())
    const synced = await enqueue(db, { sessionId: SESSION, kind: 'manual', registrationId: REG })
    await db.queue.update(synced.entryId, { status: 'synced' })
    const pending = await enqueue(db, { sessionId: SESSION, kind: 'recheck', token: 't' })
    const attention = await enqueue(db, { sessionId: SESSION, kind: 'recheck', token: 'u' })
    await db.queue.update(attention.entryId, { status: 'needs_attention' })
    const otherSynced = await enqueue(db, { sessionId: OTHER, kind: 'recheck', token: 'v' })
    await db.queue.update(otherSynced.entryId, { status: 'synced' })

    await savePack(db, SESSION, pack())

    const left = (await db.queue.toArray()).map(r => r.entryId).sort()
    expect(left).toEqual([pending.entryId, attention.entryId, otherSynced.entryId].sort())
  })
})

