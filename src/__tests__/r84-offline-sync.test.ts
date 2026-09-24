import { describe, it, expect, vi, beforeEach } from 'vitest'

// R84 — event-door offline sync: one result per entry keyed by entryId, the real
// scan time (clamped) in checked_in_at, the syncing embed staff recorded, and the
// online door scan unchanged. Backed by a small filter-aware fake DB.

const STAFF_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'staff@test.com' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/gate', () => ({ isSuperAdmin: vi.fn().mockReturnValue(true) }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'fake-embed-token' }) }),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn(),
  COOKIE_NAME: 'embed_session',
}))
vi.mock('@/lib/trigger', () => ({ enqueueGhlStageMove: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

type Row = Record<string, unknown>
let db: Record<string, Row[]>
// Registration ids whose check_ins insert fails (a database error, not a refusal).
let failInsertFor: Set<string>

function table(name: string) {
  const filters: [string, unknown][] = []
  const inFilters: [string, unknown[]][] = []
  const ilikeFilters: [string, string][] = []
  const match = () => (db[name] ?? []).filter(r =>
    filters.every(([c, v]) => (r[c] ?? null) === v) &&
    inFilters.every(([c, vs]) => vs.includes(r[c])) &&
    ilikeFilters.every(([c, v]) => String(r[c] ?? '').toLowerCase() === v))
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
    is: (c: string, v: unknown) => { filters.push([c, v]); return q },
    in: (c: string, vs: unknown[]) => { inFilters.push([c, vs]); return q },
    ilike: (c: string, pattern: string) => { ilikeFilters.push([c, pattern.replace(/\\(.)/g, '$1').toLowerCase()]); return q },
    limit: () => q,
    insert: (row: Row) => {
      if (name === 'check_ins' && failInsertFor.has(row.registration_id as string)) {
        return Promise.resolve({ error: { message: 'connection reset' } })
      }
      // The 0151 partial unique index on client_entry_id.
      if (name === 'check_ins' && row.client_entry_id &&
          (db.check_ins ?? []).some(r => r.client_entry_id === row.client_entry_id)) {
        return Promise.resolve({ error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
      }
      (db[name] ??= []).push(row)
      return Promise.resolve({ error: null })
    },
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: match(), error: null }).then(resolve),
    single: async () => {
      const rows = match()
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    },
  }
  return q
}
const fakeClient = { from: (t: string) => table(t) }
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve(fakeClient)) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeClient) }))

import { checkInByQR, processOfflineQueue } from '@/lib/checkin/actions'
import { processOfflineQueue as embedProcessOfflineQueue } from '@/lib/embedded/checkin-actions'
import { verifyEmbeddedSession } from '@/lib/embedded/session'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  resolveScanTime,
  MAX_SCAN_AGE_MS,
  SCAN_TIME_CLAMPED_NOTE,
  STALE_SCAN_REASON,
  type OfflineSyncResponse,
} from '@/lib/checkin/offline-sync'
import {
  GHL_STAGE_IDS, GHL_EVENTS_PIPELINE_ID, GHL_FIELD_KEYS, GHL_STAGE_TAGS, GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

const CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS as GhlOrgConfig['fieldIds'],
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
  calendarId: null,
}

const ORG = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const EVENT = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const MEMBER_ID = 'f1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

let n = 0
const entryId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

function reg(id: string, status: string): Row {
  return {
    id, event_id: EVENT, status, qr_code: `${id}-qr`,
    attendee_name: `Name ${id}`, attendee_email: `${id}@test.com`, ticket_types: { name: 'General' },
  }
}

function embedAs(email?: string) {
  vi.mocked(verifyEmbeddedSession).mockResolvedValue(
    email === undefined ? { location_id: 'loc_1' } : { location_id: 'loc_1', user_email: email },
  )
}

const doorRows = () => db.check_ins.filter(r => (r.session_id ?? null) === null)
const rowFor = (regId: string) => db.check_ins.find(r => r.registration_id === regId)

beforeEach(() => {
  embedAs()
  failInsertFor = new Set()
  vi.mocked(enqueueGhlStageMove).mockClear()
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(CONFIG)
  db = {
    events: [{ id: EVENT, org_id: ORG }],
    ghl_location_links: [{ ghl_location_id: 'loc_1', org_id: ORG }],
    registrations: [
      reg('r-new', 'confirmed'),
      reg('r-new2', 'confirmed'),
      reg('r-done', 'confirmed'),
      reg('r-cancelled', 'cancelled'),
      reg('r-refunded', 'refunded'),
    ],
    check_ins: [{ id: 'ci-1', registration_id: 'r-done', event_id: EVENT, session_id: null, checked_in_at: hoursAgo(2) }],
    profiles: [{ id: MEMBER_ID, email: 'door.staff@org.test' }],
    org_members: [{ org_id: ORG, user_id: MEMBER_ID }],
    audit_logs: [],
  }
})

// Both surfaces share the contract; run the common cases against each.
const surfaces = [
  { name: 'dashboard', run: (raw: unknown) => processOfflineQueue(raw) },
  { name: 'embedded', run: (raw: unknown) => embedProcessOfflineQueue(raw) },
] as const

async function sync(run: (raw: unknown) => Promise<unknown>, entries: unknown[]): Promise<OfflineSyncResponse> {
  const res = await run({ eventId: EVENT, deviceId: 'dev-1', entries })
  expect(res).toHaveProperty('results')
  return res as OfflineSyncResponse
}

describe.each(surfaces)('processOfflineQueue ($name) — per-entry results', ({ name, run }) => {
  it('returns one result per entry keyed by entryId: accepted, already checked in, refused', async () => {
    const [a, b, c, d, e] = [entryId(), entryId(), entryId(), entryId(), entryId()]
    const res = await sync(run, [
      { entryId: a, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) },
      { entryId: b, qr_code: 'r-done-qr', scanned_at: hoursAgo(1) },
      { entryId: c, qr_code: 'r-cancelled-qr', scanned_at: hoursAgo(1) },
      { entryId: d, qr_code: 'no-such-code', scanned_at: hoursAgo(1) },
      { entryId: e, qr_code: 'r-refunded-qr', scanned_at: hoursAgo(1) },
    ])
    expect(res.results).toEqual([
      { entryId: a, status: 'accepted' },
      { entryId: b, status: 'already_checked_in' },
      { entryId: c, status: 'refused', reason: 'Do not admit Name r-cancelled: Registration is cancelled. Send them to the registration desk.' },
      { entryId: d, status: 'refused', reason: 'QR code not found for this event' },
      { entryId: e, status: 'refused', reason: 'Do not admit Name r-refunded: Registration was refunded. Send them to the registration desk.' },
    ])
    expect(res.processed).toBe(1)
    expect(res.total).toBe(5)
    expect(doorRows().map(r => r.registration_id).sort()).toEqual(['r-done', 'r-new'])
  })

  it('one bad entry does not block the rest', async () => {
    const [a, bad, b] = [entryId(), entryId(), entryId()]
    const res = await sync(run, [
      { entryId: a, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) },
      { entryId: bad, qr_code: '', scanned_at: hoursAgo(1) },
      { entryId: b, qr_code: 'r-new2-qr', scanned_at: hoursAgo(1) },
    ])
    const byId = new Map(res.results.map(r => [r.entryId, r]))
    expect(byId.get(a)!.status).toBe('accepted')
    expect(byId.get(bad)).toEqual({ entryId: bad, status: 'refused', reason: 'Invalid queued scan' })
    expect(byId.get(b)!.status).toBe('accepted')
  })

  it('a database failure on one entry returns retry for it and still processes the others', async () => {
    failInsertFor = new Set(['r-new'])
    const [a, b] = [entryId(), entryId()]
    const res = await sync(run, [
      { entryId: a, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) },
      { entryId: b, qr_code: 'r-new2-qr', scanned_at: hoursAgo(1) },
    ])
    expect(res.results).toEqual([
      { entryId: a, status: 'retry', reason: 'Server error' },
      { entryId: b, status: 'accepted' },
    ])
  })

  it('the same code queued twice is written once (entries run in order)', async () => {
    const [a, b] = [entryId(), entryId()]
    const res = await sync(run, [
      { entryId: a, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) },
      { entryId: b, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) },
    ])
    expect(res.results.map(r => r.status)).toEqual(['accepted', 'already_checked_in'])
    expect(doorRows().filter(r => r.registration_id === 'r-new')).toHaveLength(1)
  })

  it('scanned_at lands in checked_in_at; synced_at is the server receive time; R87 columns set', async () => {
    const scannedAt = hoursAgo(5)
    const id = entryId()
    const before = Date.now()
    await sync(run, [{ entryId: id, qr_code: 'r-new-qr', scanned_at: scannedAt }])
    const row = rowFor('r-new')!
    expect(row.checked_in_at).toBe(scannedAt)
    expect(Date.parse(row.synced_at as string)).toBeGreaterThanOrEqual(before)
    // R87: the surface, never the legacy 'offline_sync'; the offline marker is its own columns.
    expect(row.checked_in_source).toBe(name === 'dashboard' ? 'dashboard' : 'embed')
    expect(row).toEqual(expect.objectContaining({ is_offline: true, client_scanned_at: scannedAt, client_entry_id: id }))
  })

  it('corrects for device clock skew from deviceNow; client_scanned_at keeps the raw device time', async () => {
    // Device clock is 2h behind: it says it is 1h ago now, and scanned 3h ago on its clock.
    const deviceNow = hoursAgo(2)
    const rawScan = hoursAgo(5)
    const res = (await run({ eventId: EVENT, deviceId: 'dev-1', deviceNow, entries: [
      { entryId: entryId(), qr_code: 'r-new-qr', scanned_at: rawScan },
    ] })) as OfflineSyncResponse
    expect(res.results[0].status).toBe('accepted')
    const row = rowFor('r-new')!
    expect(row.client_scanned_at).toBe(rawScan)
    // Corrected = raw + 2h = 3h ago (allow for the test's own runtime).
    expect(Math.abs(Date.parse(row.checked_in_at as string) - Date.parse(hoursAgo(3)))).toBeLessThan(5_000)
  })

  it('a replayed entryId (unique client_entry_id) is already_checked_in, never an error', async () => {
    const id = entryId()
    await sync(run, [{ entryId: id, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) }])
    // The door check-in was undone since, so only the client_entry_id index catches the replay.
    db.check_ins = db.check_ins.map(r => r.registration_id === 'r-new' ? { ...r, registration_id: 'undone' } : r)
    const res = await sync(run, [{ entryId: id, qr_code: 'r-new-qr', scanned_at: hoursAgo(1) }])
    expect(res.results).toEqual([{ entryId: id, status: 'already_checked_in' }])
  })

  it('a future scanned_at is clamped to the server now, and the result says so', async () => {
    const id = entryId()
    const before = Date.now()
    const res = await sync(run, [{ entryId: id, qr_code: 'r-new-qr', scanned_at: new Date(Date.now() + 3600_000).toISOString() }])
    expect(res.results).toEqual([{ entryId: id, status: 'accepted', note: SCAN_TIME_CLAMPED_NOTE }])
    const at = Date.parse(rowFor('r-new')!.checked_in_at as string)
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  it('a scanned_at older than 72 hours is refused for review and not written (stale-scan rule)', async () => {
    const id = entryId()
    const res = await sync(run, [{ entryId: id, qr_code: 'r-new-qr', scanned_at: hoursAgo(73) }])
    expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: STALE_SCAN_REASON }])
    expect(rowFor('r-new')).toBeUndefined()
  })

  it('a malformed batch is refused as a whole (the route answers non-OK)', async () => {
    const res = await run({ eventId: 'not-a-uuid', deviceId: 'dev-1', entries: [] })
    expect(res).toHaveProperty('error')
  })
})

describe('processOfflineQueue (embedded) — syncing staff', () => {
  it('records the syncing staff email and member id (resolveEmbedStaff)', async () => {
    embedAs(' Door.Staff@ORG.test ')
    await sync(embedProcessOfflineQueue, [{ entryId: entryId(), qr_code: 'r-new-qr', scanned_at: hoursAgo(1) }])
    expect(rowFor('r-new')).toEqual(expect.objectContaining({
      checked_in_by: MEMBER_ID, checked_in_by_email: 'door.staff@org.test', checked_in_source: 'embed', is_offline: true,
    }))
  })

  it('an email with no member profile records the email only', async () => {
    embedAs('ghl.only@agency.test')
    await sync(embedProcessOfflineQueue, [{ entryId: entryId(), qr_code: 'r-new-qr', scanned_at: hoursAgo(1) }])
    expect(rowFor('r-new')).toEqual(expect.objectContaining({ checked_in_by: null, checked_in_by_email: 'ghl.only@agency.test' }))
  })

  it('a missing email never blocks the sync', async () => {
    embedAs()
    const res = await sync(embedProcessOfflineQueue, [{ entryId: entryId(), qr_code: 'r-new-qr', scanned_at: hoursAgo(1) }])
    expect(res.results[0].status).toBe('accepted')
    expect(rowFor('r-new')).toEqual(expect.objectContaining({ checked_in_by: null, checked_in_by_email: null }))
  })

  it('still fires the GHL checked-in stage move for an accepted entry only', async () => {
    await sync(embedProcessOfflineQueue, [
      { entryId: entryId(), qr_code: 'r-new-qr', scanned_at: hoursAgo(1) },
      { entryId: entryId(), qr_code: 'r-done-qr', scanned_at: hoursAgo(1) },
    ])
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: 'r-new', stageId: CONFIG.stageIds.checkedIn })
  })
})

describe('processOfflineQueue (dashboard) — staff', () => {
  it('records the signed-in staff member as checked_in_by', async () => {
    await sync(processOfflineQueue, [{ entryId: entryId(), qr_code: 'r-new-qr', scanned_at: hoursAgo(1) }])
    expect(rowFor('r-new')!.checked_in_by).toBe(STAFF_ID)
  })
})

describe('online door scan is unchanged', () => {
  it('checkInByQR writes no checked_in_at (database default now) and no offline source', async () => {
    const result = await checkInByQR(EVENT, 'r-new-qr')
    expect(result.success).toBe(true)
    const row = rowFor('r-new')!
    expect(row).not.toHaveProperty('checked_in_at')
    expect(row).not.toHaveProperty('checked_in_source')
    expect(row).toEqual(expect.objectContaining({ checked_in_by: STAFF_ID, method: 'qr_scan', device_id: 'web' }))
  })

  it('checkInByQR still returns a refusal, not a throw, for an unknown code', async () => {
    expect(await checkInByQR(EVENT, 'no-such-code')).toEqual({ success: false, error: 'QR code not found for this event' })
  })
})

describe('resolveScanTime', () => {
  const now = new Date('2026-09-23T12:00:00.000Z')
  const ok = (checkedInAt: string, clamped: boolean, clientScannedAt: string | null) =>
    ({ ok: true, checkedInAt, clamped, clientScannedAt })
  it('keeps a scan time inside the window', () => {
    const t = '2026-09-23T09:30:00.000Z'
    expect(resolveScanTime(t, { now })).toEqual(ok(t, false, t))
  })
  it('keeps a scan exactly 72 hours old', () => {
    const edge = new Date(now.getTime() - MAX_SCAN_AGE_MS).toISOString()
    expect(resolveScanTime(edge, { now })).toEqual(ok(edge, false, edge))
  })
  it('refuses a scan more than 72 hours old', () => {
    expect(resolveScanTime('2026-09-20T11:59:59.000Z', { now }))
      .toEqual({ ok: false, reason: STALE_SCAN_REASON, clientScannedAt: '2026-09-20T11:59:59.000Z' })
  })
  it('records a future scan at the server now', () => {
    expect(resolveScanTime('2026-09-23T12:00:01.000Z', { now })).toEqual(ok(now.toISOString(), true, '2026-09-23T12:00:01.000Z'))
  })
  it('records an unparseable scan time at the server now', () => {
    expect(resolveScanTime('not a date', { now })).toEqual(ok(now.toISOString(), true, null))
  })
  it('shifts by serverNow - deviceNow before the stale/future rule, keeping the raw time', () => {
    // Device clock 1h ahead: its 12:30 scan happened at server 11:30.
    expect(resolveScanTime('2026-09-23T12:30:00.000Z', { now, deviceNow: '2026-09-23T13:00:00.000Z' }))
      .toEqual(ok('2026-09-23T11:30:00.000Z', false, '2026-09-23T12:30:00.000Z'))
    // Device clock 2 days behind: a scan that looks 73h old is really 25h old — kept.
    expect(resolveScanTime('2026-09-20T11:00:00.000Z', { now, deviceNow: '2026-09-21T12:00:00.000Z' }))
      .toEqual(ok('2026-09-22T11:00:00.000Z', false, '2026-09-20T11:00:00.000Z'))
    // Device clock 3 days ahead: a scan 1h ago on its clock is 1h ago on the server's
    // (kept, not refused as stale nor clamped as future).
    expect(resolveScanTime('2026-09-26T11:00:00.000Z', { now, deviceNow: '2026-09-26T12:00:00.000Z' }))
      .toEqual(ok('2026-09-23T11:00:00.000Z', false, '2026-09-26T11:00:00.000Z'))
    // Device clock 2 days behind: a scan 80h before its now is still stale after correction.
    expect(resolveScanTime('2026-09-18T04:00:00.000Z', { now, deviceNow: '2026-09-21T12:00:00.000Z' }))
      .toEqual({ ok: false, reason: STALE_SCAN_REASON, clientScannedAt: '2026-09-18T04:00:00.000Z' })
  })
  it('makes no correction for a missing or unparseable deviceNow', () => {
    const t = '2026-09-23T09:30:00.000Z'
    expect(resolveScanTime(t, { now, deviceNow: null })).toEqual(ok(t, false, t))
    expect(resolveScanTime(t, { now, deviceNow: 'garbage' })).toEqual(ok(t, false, t))
  })
  it('clamps a corrected time earlier than the floor up to the floor', () => {
    const floor = new Date('2026-09-23T10:00:00.000Z')
    expect(resolveScanTime('2026-09-23T09:00:00.000Z', { now, floor })).toEqual(ok(floor.toISOString(), true, '2026-09-23T09:00:00.000Z'))
  })
})
