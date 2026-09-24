// @vitest-environment node
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { createHash } from 'node:crypto'

// M3b-A — offline session scanning, server side: the offline pack (R86), the
// two session sync routes (R79/R80/R81/R85/R88) and their per-entry contract.
// Backed by a filter-, order- and range-aware fake DB; the grant is REAL.

const STAFF = 'a1b2c3d4-e5f6-4a7b-8c9d-00000000aaaa'   // signed in at sync time
const GRANTEE = 'a1b2c3d4-e5f6-4a7b-8c9d-00000000bbbb' // held the grant offline
const NOPERM = 'a1b2c3d4-e5f6-4a7b-8c9d-00000000cccc'
const ORG = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const EVENT = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const OTHER_EVENT = 'e2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION = '5e551000-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const OTHER_SESSION = '5e552000-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ROLE_CHECKIN = 'r0000000-0000-4000-8000-000000000001'
const ROLE_VIEWER = 'r0000000-0000-4000-8000-000000000002'

const R_OK = '11111111-1111-4111-8111-111111111111'
const R_OK2 = '11111111-1111-4111-8111-222222222222'
const R_REFUNDED = '11111111-1111-4111-8111-333333333333'
const R_PENDING = '11111111-1111-4111-8111-444444444444'
const R_OTHER_EVENT = '11111111-1111-4111-8111-555555555555'

const QR_OK = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const GHL_OK = 'abcdefabcdefabcdefabcdef'
const GHL_OTHER = '0123456789abcdef01234567'
const ghlToken = (id: string) => `v1.${id}.${'A'.repeat(43)}`

let liveUser: { id: string } | null
let embedEmail: string | undefined
let embedValid: boolean

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => liveUser),
  requireUser: vi.fn(async () => {
    if (!liveUser) throw new Error('NEXT_REDIRECT')
    return liveUser
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/admin/gate', () => ({ isSuperAdmin: vi.fn().mockReturnValue(false) }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => (embedValid ? { value: 'embed-token' } : undefined)) })),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn(async () => {
    if (!embedValid) throw new Error('JWTExpired')
    return embedEmail === undefined ? { location_id: 'loc_1' } : { location_id: 'loc_1', user_email: embedEmail }
  }),
  COOKIE_NAME: 'embedded_session',
}))
vi.mock('@/lib/trigger', () => ({ enqueueGhlStageMove: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn().mockResolvedValue(null) }
})
vi.mock('@/lib/integrations/ghl/location', () => ({ ghlLocationIdForOrg: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn().mockResolvedValue(undefined), isUuid: () => true }))

type Row = Record<string, unknown>
let db: Record<string, Row[]>
let failInsertFor: Set<string>
// Max rows one request returns, like PostgREST's cap.
const ROW_CAP = 1000
let rangeCalls: number

function table(name: string) {
  const filters: [string, unknown][] = []
  const inFilters: [string, unknown[]][] = []
  const ilikeFilters: [string, string][] = []
  let orderBy: string | null = null
  let range: [number, number] | null = null
  const match = () => {
    let rows = (db[name] ?? []).filter(r =>
      filters.every(([c, v]) => (r[c] ?? null) === v) &&
      inFilters.every(([c, vs]) => vs.includes(r[c])) &&
      ilikeFilters.every(([c, v]) => String(r[c] ?? '').toLowerCase() === v))
    if (orderBy) rows = [...rows].sort((a, b) => String(a[orderBy!]).localeCompare(String(b[orderBy!])))
    if (range) rows = rows.slice(range[0], range[1] + 1)
    return rows.slice(0, ROW_CAP)
  }
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
    is: (c: string, v: unknown) => { filters.push([c, v]); return q },
    in: (c: string, vs: unknown[]) => { inFilters.push([c, vs]); return q },
    ilike: (c: string, p: string) => { ilikeFilters.push([c, p.replace(/\\(.)/g, '$1').toLowerCase()]); return q },
    order: (c: string) => { orderBy = c; return q },
    range: (from: number, to: number) => { rangeCalls++; range = [from, to]; return q },
    limit: () => q,
    insert: (row: Row) => {
      if (name === 'check_ins') {
        if (failInsertFor.has(row.registration_id as string)) {
          return Promise.resolve({ error: { message: 'connection reset' } })
        }
        const rows = db.check_ins ?? []
        const dupSession = row.session_id != null &&
          rows.some(r => r.registration_id === row.registration_id && r.session_id === row.session_id)
        const dupEntry = row.client_entry_id != null && rows.some(r => r.client_entry_id === row.client_entry_id)
        if (dupSession || dupEntry) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } })
      }
      (db[name] ??= []).push({ id: `row-${Math.random()}`, ...row })
      return Promise.resolve({ error: null })
    },
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    single: async () => {
      const rows = match()
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: match(), error: null }).then(resolve),
  }
  return q
}
const fakeClient = { from: (t: string) => table(t) }
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve(fakeClient)) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeClient) }))

beforeAll(() => {
  process.env.EMBEDDED_SESSION_SECRET = 'test-embedded-session-secret-at-least-32-bytes'
})

import { getOfflineSessionPack, processOfflineSessionQueue } from '@/lib/checkin/actions'
import { embedGetOfflineSessionPack, embedProcessOfflineSessionQueue } from '@/lib/embedded/checkin-actions'
import { mintOfflineGrant, GRANT_EXPIRED_REASON, GRANT_PERMISSION_LOST_REASON } from '@/lib/checkin/offline-grant'
import { STALE_SCAN_REASON, SESSION_NOT_FOUND_REASON, type OfflineSyncResponse } from '@/lib/checkin/offline-sync'
import { GHL_TICKET_NOT_REGISTERED } from '@/lib/checkin/scan-token'
import { logAudit } from '@/lib/audit/log'
import { POST as dashboardSyncRoute } from '@/app/api/events/[id]/sessions/[sessionId]/checkin/sync/route'
import { POST as embedSyncRoute } from '@/app/api/embedded/events/[id]/sessions/[sessionId]/checkin/sync/route'

let n = 0
const entryId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
const sha = (v: string) => createHash('sha256').update(v.toLowerCase()).digest('hex')

function reg(id: string, status: string, extra: Row = {}): Row {
  return {
    id, event_id: EVENT, status, qr_code: null, ghl_attendee_id: null,
    attendee_name: `Name ${id.slice(-4)}`, attendee_email: `${id.slice(-4)}@test.com`,
    ticket_types: { name: 'General' }, events: { org_id: ORG }, ...extra,
  }
}

beforeEach(() => {
  liveUser = { id: STAFF }
  embedEmail = 'grantee@org.test'
  embedValid = true
  failInsertFor = new Set()
  rangeCalls = 0
  vi.mocked(logAudit).mockClear()
  db = {
    events: [
      { id: EVENT, org_id: ORG, end_at: new Date(Date.now() + 6 * 3600_000).toISOString() },
      { id: OTHER_EVENT, org_id: ORG, end_at: null },
    ],
    sessions: [{ id: SESSION, event_id: EVENT }, { id: OTHER_SESSION, event_id: OTHER_EVENT }],
    ghl_location_links: [{ ghl_location_id: 'loc_1', org_id: ORG }],
    org_members: [
      { org_id: ORG, user_id: STAFF, role_id: ROLE_CHECKIN },
      { org_id: ORG, user_id: GRANTEE, role_id: ROLE_CHECKIN },
      { org_id: ORG, user_id: NOPERM, role_id: ROLE_VIEWER },
    ],
    role_permissions: [{ role_id: ROLE_CHECKIN, permission_key: 'checkin.manage' }],
    profiles: [{ id: GRANTEE, email: 'grantee@org.test' }],
    registrations: [
      reg(R_OK, 'confirmed', { qr_code: QR_OK, ghl_attendee_id: GHL_OK }),
      reg(R_OK2, 'confirmed'),
      reg(R_REFUNDED, 'refunded', { qr_code: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
      reg(R_PENDING, 'pending'),
      { ...reg(R_OTHER_EVENT, 'confirmed', { ghl_attendee_id: GHL_OTHER }), event_id: OTHER_EVENT },
    ],
    check_ins: [],
  }
})

const sessionRows = () => db.check_ins.filter(r => r.session_id === SESSION)
const rowFor = (regId: string) => db.check_ins.find(r => r.registration_id === regId && r.session_id === SESSION)

// Grants are issued when the scanner loads its pack, before any scan: 4h ago here.
const issuedAt = () => new Date(Date.now() - 4 * 3600_000)
async function dashGrant(userId = GRANTEE, over: Partial<{ eventId: string; sessionId: string }> = {}) {
  return mintOfflineGrant(
    { surface: 'dashboard', eventId: EVENT, sessionId: SESSION, orgId: ORG, userId, email: null, ...over },
    null,
    issuedAt(),
  )
}
async function embedGrant(userId: string | null = GRANTEE, email: string | null = 'grantee@org.test') {
  return mintOfflineGrant({ surface: 'embed', eventId: EVENT, sessionId: SESSION, orgId: ORG, userId, email }, null, issuedAt())
}

const surfaces = [
  { name: 'dashboard', run: processOfflineSessionQueue, grant: () => dashGrant(), source: 'dashboard' },
  { name: 'embedded', run: embedProcessOfflineSessionQueue, grant: () => embedGrant(), source: 'embed' },
] as const

async function sync(
  run: (e: string, s: string, raw: unknown) => Promise<unknown>,
  grant: string,
  entries: unknown[],
  extra: Row = {},
): Promise<OfflineSyncResponse> {
  const res = await run(EVENT, SESSION, { deviceId: 'dev-1', grant, entries, ...extra })
  expect(res).toHaveProperty('results')
  return res as OfflineSyncResponse
}

// ── Offline pack ──────────────────────────────────────────────────────────────

describe.each([
  { name: 'dashboard', pack: getOfflineSessionPack },
  { name: 'embedded', pack: embedGetOfflineSessionPack },
])('offline pack ($name)', ({ pack }) => {
  it('lists confirmed registrations of this event only, with hashed ids and never raw ones', async () => {
    db.check_ins.push({ registration_id: R_OK, event_id: EVENT, session_id: SESSION, checked_in_at: '2026-09-24T10:00:00.000Z' })
    db.check_ins.push({ registration_id: R_OK2, event_id: EVENT, session_id: null, checked_in_at: '2026-09-24T09:00:00.000Z' })
    const res = await pack(EVENT, SESSION)
    if ('error' in res) throw new Error(res.error)
    expect(res.attendees.map(a => a.registrationId).sort()).toEqual([R_OK, R_OK2])
    const ok = res.attendees.find(a => a.registrationId === R_OK)!
    expect(ok).toEqual({
      registrationId: R_OK, name: 'Name 1111', email: '1111@test.com', ticketName: 'General',
      ghlIdHash: sha(GHL_OK), qrHash: sha(QR_OK), checkedInAt: '2026-09-24T10:00:00.000Z',
    })
    // The door check-in is not this session's.
    expect(res.attendees.find(a => a.registrationId === R_OK2)).toEqual(expect.objectContaining({
      ghlIdHash: null, qrHash: null, checkedInAt: null,
    }))
    const json = JSON.stringify(res)
    expect(json).not.toContain(QR_OK)
    expect(json).not.toContain(GHL_OK)
    expect(typeof res.grant).toBe('string')
    expect(Date.parse(res.serverNow)).not.toBeNaN()
  })

  it('hashes the LOWERCASED value (SHA-256 hex)', async () => {
    db.registrations[0].qr_code = QR_OK.toUpperCase()
    const res = await pack(EVENT, SESSION)
    if ('error' in res) throw new Error(res.error)
    expect(res.attendees.find(a => a.registrationId === R_OK)!.qrHash).toBe(sha(QR_OK))
    expect(sha(QR_OK)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('pages past the 1,000-row cap (O119)', async () => {
    for (let i = 0; i < 2345; i++) {
      db.registrations.push(reg(`22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, 'confirmed'))
    }
    const res = await pack(EVENT, SESSION)
    if ('error' in res) throw new Error(res.error)
    expect(res.attendees).toHaveLength(2347)
    expect(new Set(res.attendees.map(a => a.registrationId)).size).toBe(2347)
    expect(rangeCalls).toBeGreaterThanOrEqual(4) // 3 registration pages + check_ins
  })

  it('refuses a session of another event', async () => {
    expect(await pack(EVENT, OTHER_SESSION)).toHaveProperty('error')
  })
})

describe('offline pack authorization', () => {
  it('dashboard requires checkin.manage (membership alone is not enough)', async () => {
    liveUser = { id: NOPERM }
    expect(await getOfflineSessionPack(EVENT, SESSION)).toHaveProperty('error')
  })

  it('dashboard grant names the signed-in staff member', async () => {
    const res = await getOfflineSessionPack(EVENT, SESSION)
    if ('error' in res) throw new Error(res.error)
    const body = JSON.parse(Buffer.from(res.grant.split('.')[1], 'base64url').toString())
    expect(body).toEqual(expect.objectContaining({ surface: 'dashboard', userId: STAFF, email: null, eventId: EVENT, sessionId: SESSION }))
  })

  it('embedded requires the session to belong to the event', async () => {
    expect(await embedGetOfflineSessionPack(EVENT, '5e559999-e5f6-4a7b-8c9d-0e1f2a3b4c5e')).toHaveProperty('error')
  })

  it('embedded refuses an event outside the linked org', async () => {
    db.events[0].org_id = 'c9999999-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
    expect(await embedGetOfflineSessionPack(EVENT, SESSION)).toHaveProperty('error')
  })

  it('embedded grant carries the embed email and the resolved member id', async () => {
    const res = await embedGetOfflineSessionPack(EVENT, SESSION)
    if ('error' in res) throw new Error(res.error)
    const body = JSON.parse(Buffer.from(res.grant.split('.')[1], 'base64url').toString())
    expect(body).toEqual(expect.objectContaining({ surface: 'embed', userId: GRANTEE, email: 'grantee@org.test' }))
  })
})

// ── Session sync, both surfaces ───────────────────────────────────────────────

describe.each(surfaces)('session sync ($name)', ({ run, grant, source }) => {
  it('scan by Prezva QR and by GHL token are accepted with the R87 columns and the grant identity', async () => {
    const [a, b] = [entryId(), entryId()]
    const scannedAt = hoursAgo(1)
    const res = await sync(run, await grant(), [
      { kind: 'scan', entryId: a, scannedAt, token: QR_OK.toUpperCase() },
      { kind: 'scan', entryId: b, scannedAt, token: ghlToken(GHL_OK) },
    ])
    expect(res.results).toEqual([
      { entryId: a, status: 'accepted', kind: 'scan' },
      { entryId: b, status: 'already_checked_in', kind: 'scan' },
    ])
    expect(rowFor(R_OK)).toEqual(expect.objectContaining({
      method: 'qr_scan', checked_in_by: GRANTEE, checked_in_source: source,
      is_offline: true, client_scanned_at: scannedAt, client_entry_id: a, checked_in_at: scannedAt,
    }))
  })

  it('R79: a GHL token registered on another event is refused with the online wording', async () => {
    const id = entryId()
    const res = await sync(run, await grant(), [{ kind: 'scan', entryId: id, scannedAt: hoursAgo(1), token: ghlToken(GHL_OTHER) }])
    expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: GHL_TICKET_NOT_REGISTERED, kind: 'scan' }])
    expect(JSON.stringify(res)).not.toContain(OTHER_EVENT)
  })

  it('R80: refunded and non-confirmed registrations are refused', async () => {
    const [a, b] = [entryId(), entryId()]
    const res = await sync(run, await grant(), [
      { kind: 'scan', entryId: a, scannedAt: hoursAgo(1), token: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      { kind: 'manual', entryId: b, scannedAt: hoursAgo(1), registrationId: R_PENDING },
    ])
    expect(res.results).toEqual([
      { entryId: a, status: 'refused', reason: 'Registration was refunded', kind: 'scan' },
      { entryId: b, status: 'refused', reason: 'Registration is not confirmed', kind: 'manual' },
    ])
    expect(sessionRows()).toHaveLength(0)
  })

  it('R85: a recheck that is valid at sync is accepted at the skew-corrected scan time', async () => {
    const id = entryId()
    // Device clock 2h behind.
    const deviceNow = hoursAgo(2)
    const raw = hoursAgo(3)
    const res = await sync(run, await grant(), [{ kind: 'recheck', entryId: id, scannedAt: raw, token: ghlToken(GHL_OK) }], { deviceNow })
    expect(res.results).toEqual([{ entryId: id, status: 'accepted', kind: 'recheck' }])
    const row = rowFor(R_OK)!
    expect(row.client_scanned_at).toBe(raw)
    // Corrected = raw + 2h = 1h ago.
    expect(Math.abs(Date.parse(row.checked_in_at as string) - Date.parse(hoursAgo(1)))).toBeLessThan(5_000)
  })

  it('a corrected time before the grant was issued (minus 5 min) is recorded at that floor', async () => {
    const id = entryId()
    const res = await sync(run, await grant(), [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(6), registrationId: R_OK }])
    expect(res.results[0]).toEqual(expect.objectContaining({ status: 'accepted', note: expect.any(String) }))
    const floor = Date.now() - 4 * 3600_000 - 5 * 60_000
    expect(Math.abs(Date.parse(rowFor(R_OK)!.checked_in_at as string) - floor)).toBeLessThan(5_000)
  })

  it('manual writes method manual; override writes method override (R81)', async () => {
    const [a, b] = [entryId(), entryId()]
    const res = await sync(run, await grant(), [
      { kind: 'manual', entryId: a, scannedAt: hoursAgo(0.01), registrationId: R_OK },
      { kind: 'override', entryId: b, scannedAt: hoursAgo(0.01), registrationId: R_OK2 },
    ])
    expect(res.results.map(r => r.status)).toEqual(['accepted', 'accepted'])
    expect(rowFor(R_OK)!.method).toBe('manual')
    expect(rowFor(R_OK2)).toEqual(expect.objectContaining({ method: 'override', checked_in_by: GRANTEE }))
  })

  it('a registration of another event is refused for manual/override', async () => {
    const id = entryId()
    const res = await sync(run, await grant(), [{ kind: 'override', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OTHER_EVENT }])
    expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: 'Attendee not found', kind: 'override' }])
  })

  it('a duplicate (registration + session) is already_checked_in, never an error (O105)', async () => {
    db.check_ins.push({ registration_id: R_OK, event_id: EVENT, session_id: SESSION, checked_in_at: hoursAgo(1) })
    const id = entryId()
    const res = await sync(run, await grant(), [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
    expect(res.results).toEqual([{ entryId: id, status: 'already_checked_in', kind: 'manual' }])
  })

  it('a replayed client_entry_id is already_checked_in', async () => {
    const id = entryId()
    const g = await grant()
    await sync(run, g, [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
    // Undone since; only the client_entry_id index catches the replay.
    db.check_ins = db.check_ins.map(r => ({ ...r, session_id: r.session_id === SESSION ? null : r.session_id }))
    const res = await sync(run, g, [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
    expect(res.results).toEqual([{ entryId: id, status: 'already_checked_in', kind: 'manual' }])
  })

  it('stale (>72h after correction) is refused; a future scan is recorded at the server now', async () => {
    const [a, b] = [entryId(), entryId()]
    const before = Date.now()
    const res = await sync(run, await grant(), [
      { kind: 'manual', entryId: a, scannedAt: hoursAgo(80), registrationId: R_OK },
      { kind: 'manual', entryId: b, scannedAt: hoursAgo(-2), registrationId: R_OK2 },
    ])
    expect(res.results[0]).toEqual({ entryId: a, status: 'refused', reason: STALE_SCAN_REASON, kind: 'manual' })
    expect(res.results[1]).toEqual(expect.objectContaining({ entryId: b, status: 'accepted', note: expect.any(String) }))
    const at = Date.parse(rowFor(R_OK2)!.checked_in_at as string)
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
  })

  it('one bad entry does not block the rest (invalid, database failure)', async () => {
    failInsertFor = new Set([R_OK])
    const [a, bad, c] = [entryId(), entryId(), entryId()]
    const res = await sync(run, await grant(), [
      { kind: 'manual', entryId: a, scannedAt: hoursAgo(0.01), registrationId: R_OK },
      { kind: 'teleport', entryId: bad, scannedAt: hoursAgo(0.01) },
      { kind: 'manual', entryId: c, scannedAt: hoursAgo(0.01), registrationId: R_OK2 },
    ])
    const byId = new Map(res.results.map(r => [r.entryId, r]))
    expect(byId.get(a)).toEqual({ entryId: a, status: 'retry', reason: 'Server error', kind: 'manual' })
    expect(byId.get(bad)).toEqual({ entryId: bad, status: 'refused', reason: 'Invalid queued scan' })
    expect(byId.get(c)!.status).toBe('accepted')
    expect(res.processed).toBe(1)
  })

  it('an expired, foreign or wrong-session grant refuses every entry', async () => {
    const expired = await mintOfflineGrant(
      { surface: source === 'embed' ? 'embed' : 'dashboard', eventId: EVENT, sessionId: SESSION, orgId: ORG, userId: GRANTEE, email: 'grantee@org.test' },
      hoursAgo(72),
    )
    const wrongSession = await dashGrant(GRANTEE, { sessionId: OTHER_SESSION })
    for (const g of [expired, wrongSession, 'not-a-jwt']) {
      const id = entryId()
      const res = await sync(run, g, [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
      expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: GRANT_EXPIRED_REASON, kind: 'manual' }])
    }
    expect(sessionRows()).toHaveLength(0)
  })

  it('a deleted session refuses every entry', async () => {
    db.sessions = db.sessions.filter(s => s.id !== SESSION)
    const id = entryId()
    const res = await sync(run, await grant(), [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
    expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: SESSION_NOT_FOUND_REASON, kind: 'manual' }])
  })

  it('logs each accepted entry with the event and offline marker', async () => {
    await sync(run, await grant(), [
      { kind: 'override', entryId: entryId(), scannedAt: hoursAgo(0.01), registrationId: R_OK },
      { kind: 'manual', entryId: entryId(), scannedAt: hoursAgo(0.01), registrationId: R_PENDING },
    ])
    expect(logAudit).toHaveBeenCalledTimes(1)
    const call = vi.mocked(logAudit).mock.calls[0]
    expect(call[2]).toBe(GRANTEE)
    expect(call[3]).toBe('checkin.scan')
    expect(call[5]).toBe(R_OK)
    expect(call[6]).toEqual({ method: 'override', offline: true, kind: 'override' })
    expect(call[7]).toEqual({ eventId: EVENT })
  })

  it('URL ids win over ids in the body', async () => {
    const id = entryId()
    const res = await run(EVENT, SESSION, {
      eventId: OTHER_EVENT, sessionId: OTHER_SESSION, deviceId: 'dev-1', grant: await grant(),
      entries: [{ kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK }],
    }) as OfflineSyncResponse
    expect(res.results[0].status).toBe('accepted')
    expect(rowFor(R_OK)!.session_id).toBe(SESSION)
  })
})

// ── Identity comes from the grant ─────────────────────────────────────────────

describe('session sync identity (R88)', () => {
  it('dashboard: the grant user is written, not the user signed in at sync', async () => {
    liveUser = { id: STAFF }
    await sync(processOfflineSessionQueue, await dashGrant(GRANTEE), [
      { kind: 'override', entryId: entryId(), scannedAt: hoursAgo(0.01), registrationId: R_OK },
    ])
    expect(rowFor(R_OK)).toEqual(expect.objectContaining({ checked_in_by: GRANTEE, method: 'override' }))
  })

  it('dashboard: a grant user who lost checkin.manage has every entry refused', async () => {
    db.org_members = db.org_members.map(m => m.user_id === GRANTEE ? { ...m, role_id: ROLE_VIEWER } : m)
    const id = entryId()
    const res = await sync(processOfflineSessionQueue, await dashGrant(GRANTEE), [
      { kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK },
    ])
    expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: GRANT_PERMISSION_LOST_REASON, kind: 'manual' }])
  })

  it('dashboard: the live user needs checkin.manage too (batch refused, entries stay pending)', async () => {
    liveUser = { id: NOPERM }
    const res = await processOfflineSessionQueue(EVENT, SESSION, { deviceId: 'd', grant: await dashGrant(), entries: [] })
    expect(res).toEqual(expect.objectContaining({ status: 403 }))
  })

  it('embedded: override writes the grant email and member id, not the live embed staff', async () => {
    embedEmail = 'someone.else@agency.test'
    await sync(embedProcessOfflineSessionQueue, await embedGrant(GRANTEE, 'grantee@org.test'), [
      { kind: 'override', entryId: entryId(), scannedAt: hoursAgo(0.01), registrationId: R_OK },
    ])
    expect(rowFor(R_OK)).toEqual(expect.objectContaining({
      method: 'override', checked_in_by: GRANTEE, checked_in_by_email: 'grantee@org.test', checked_in_source: 'embed',
    }))
  })

  it('embedded: a grant email that no longer resolves to its member has every entry refused', async () => {
    db.org_members = db.org_members.filter(m => m.user_id !== GRANTEE)
    const id = entryId()
    const res = await sync(embedProcessOfflineSessionQueue, await embedGrant(GRANTEE), [
      { kind: 'manual', entryId: id, scannedAt: hoursAgo(0.01), registrationId: R_OK },
    ])
    expect(res.results).toEqual([{ entryId: id, status: 'refused', reason: GRANT_PERMISSION_LOST_REASON, kind: 'manual' }])
  })

  it('embedded: an email-only grant (no member) records the email only', async () => {
    await sync(embedProcessOfflineSessionQueue, await embedGrant(null, 'ghl.only@agency.test'), [
      { kind: 'manual', entryId: entryId(), scannedAt: hoursAgo(0.01), registrationId: R_OK },
    ])
    expect(rowFor(R_OK)).toEqual(expect.objectContaining({ checked_in_by: null, checked_in_by_email: 'ghl.only@agency.test' }))
  })

  it('a dashboard grant is refused on the embedded route and vice versa', async () => {
    const [a, b] = [entryId(), entryId()]
    const e = await sync(embedProcessOfflineSessionQueue, await dashGrant(), [{ kind: 'manual', entryId: a, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
    expect(e.results[0].reason).toBe(GRANT_EXPIRED_REASON)
    const d = await sync(processOfflineSessionQueue, await embedGrant(), [{ kind: 'manual', entryId: b, scannedAt: hoursAgo(0.01), registrationId: R_OK }])
    expect(d.results[0].reason).toBe(GRANT_EXPIRED_REASON)
  })
})

// ── Routes ────────────────────────────────────────────────────────────────────

describe('session sync routes', () => {
  const call = (handler: typeof dashboardSyncRoute, body: unknown) =>
    handler(
      new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never,
      { params: Promise.resolve({ id: EVENT, sessionId: SESSION }) },
    )

  it('dashboard: no signed-in user → 401 { error, code: session_expired }', async () => {
    liveUser = null
    const res = await call(dashboardSyncRoute, { deviceId: 'd', grant: 'g', entries: [] })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: expect.any(String), code: 'session_expired' })
  })

  it('embedded: missing or expired embed session → 401 { error, code: session_expired }', async () => {
    embedValid = false
    const res = await call(embedSyncRoute, { deviceId: 'd', grant: 'g', entries: [] })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: expect.any(String), code: 'session_expired' })
  })

  it('a malformed batch → 400', async () => {
    const res = await call(dashboardSyncRoute, { deviceId: '', entries: 'nope' })
    expect(res.status).toBe(400)
  })

  it('a valid batch → 200 with per-entry results', async () => {
    const id = entryId()
    const res = await call(embedSyncRoute, {
      deviceId: 'd', grant: await embedGrant(), deviceNow: new Date().toISOString(),
      entries: [{ kind: 'scan', entryId: id, scannedAt: new Date().toISOString(), token: QR_OK }],
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ processed: 1, total: 1, results: [{ entryId: id, status: 'accepted', kind: 'scan' }] })
  })
})
