import { describe, it, expect, vi, beforeEach } from 'vitest'

// M3a — session scanners accept GHL ticket tokens (R79), confirmed-only (R80),
// recorded override (R81). Backed by a tiny filter-aware fake DB so "registered on
// another event" is decided by the real event_id filter, not a stubbed null.

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
vi.mock('@/lib/integrations/ghl/location', () => ({ ghlLocationIdForOrg: vi.fn().mockResolvedValue('loc_1') }))
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

type Row = Record<string, unknown>
let db: Record<string, Row[]>

function table(name: string) {
  const filters: [string, unknown][] = []
  const inFilters: [string, unknown[]][] = []
  const ilikeFilters: [string, string][] = []
  const match = () => (db[name] ?? []).filter(r =>
    filters.every(([c, v]) => r[c] === v) &&
    inFilters.every(([c, vs]) => vs.includes(r[c])) &&
    ilikeFilters.every(([c, v]) => String(r[c] ?? '').toLowerCase() === v))
  const all = async () => ({ data: match(), error: null })
  const q = {
    select: () => q,
    eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
    is: (c: string, v: unknown) => { filters.push([c, v]); return q },
    in: (c: string, vs: unknown[]) => { inFilters.push([c, vs]); return q },
    // Test patterns carry no wildcards: unescape and compare case-insensitively.
    ilike: (c: string, pattern: string) => { ilikeFilters.push([c, pattern.replace(/\\(.)/g, '$1').toLowerCase()]); return q },
    limit: () => q,
    insert: (row: Row) => { (db[name] ??= []).push(row); return Promise.resolve({ error: null }) },
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => all().then(resolve),
    single: async () => {
      const rows = match()
      return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } }
    },
  }
  return q
}
// O102: the attendee path resolves identity itself; auth.getUser feeds the email fallback.
const mockGetUser = vi.fn()
const fakeClient = { from: (t: string) => table(t), auth: { getUser: mockGetUser } }
vi.mock('@/lib/auth/session-identity', () => ({ getSessionIdentity: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(() => Promise.resolve(fakeClient)) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fakeClient) }))

import { parseScanToken, GHL_TICKET_NOT_REGISTERED } from '@/lib/checkin/scan-token'
import { orgCheckInToSession, orgOverrideSessionCheckIn, checkInToSession } from '@/lib/checkin/actions'
import { embedScanIntoSession, embedManualMarkSession, embedOverrideSessionCheckIn } from '@/lib/embedded/checkin-actions'
import { verifyEmbeddedSession } from '@/lib/embedded/session'
import { getSessionIdentity, type SessionIdentity } from '@/lib/auth/session-identity'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
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
const OTHER_ORG = 'c2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const EVENT = 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const OTHER_EVENT = 'e2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

const HERE_ATTENDEE = '6ab29e71b8ef2920288ac89f'
const OTHER_ATTENDEE = '6ab3dd6b9f47a9f61b072d42'
const SIG = 'Yku--NCIb6ZWjd2CuxVUn5HBf-OIHS4xicIe4iHhdlw'
const ghlToken = (id: string) => `v1.${id}.${SIG}`
const PREZVA_QR = 'd3eba7a02746cca2f47504cb7ea34057'

function reg(id: string, eventId: string, status: string, extra: Row = {}): Row {
  return {
    id, event_id: eventId, status,
    attendee_name: `Name ${id}`, attendee_email: `${id}@test.com`,
    ticket_types: { name: 'General' }, events: { org_id: eventId === EVENT ? ORG : OTHER_ORG },
    qr_code: `${id}-qr`, ghl_attendee_id: null,
    ...extra,
  }
}

const MEMBER_ID = 'f1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const OUTSIDER_ID = 'f2b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

function embedAs(email?: string) {
  vi.mocked(verifyEmbeddedSession).mockResolvedValue(
    email === undefined ? { location_id: 'loc_1' } : { location_id: 'loc_1', user_email: email },
  )
}

beforeEach(() => {
  embedAs()
  vi.mocked(getSessionIdentity).mockReset().mockResolvedValue({ type: 'anonymous' })
  mockGetUser.mockReset().mockResolvedValue({ data: { user: null } })
  vi.mocked(enqueueGhlStageMove).mockClear()
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(CONFIG)
  db = {
    events: [
      { id: EVENT, org_id: ORG, title: 'Here Event', slug: 'here-event' },
      { id: OTHER_EVENT, org_id: OTHER_ORG, title: 'Secret Other Event', slug: 'other-event' },
    ],
    ghl_location_links: [{ ghl_location_id: 'loc_1', org_id: ORG }],
    sessions: [{ id: SESSION, event_id: EVENT }],
    registrations: [
      reg('r-ghl', EVENT, 'confirmed', { ghl_attendee_id: HERE_ATTENDEE }),
      reg('r-other', OTHER_EVENT, 'confirmed', { ghl_attendee_id: OTHER_ATTENDEE }),
      reg('r-prezva', EVENT, 'confirmed', { qr_code: PREZVA_QR }),
      reg('r-legacy', EVENT, 'confirmed', { qr_code: 'prezva-0c5c7abc' }),
      reg('r-pending', EVENT, 'pending', { qr_code: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      reg('r-waitlisted', EVENT, 'waitlisted', { qr_code: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
    ],
    check_ins: [],
    profiles: [
      { id: MEMBER_ID, email: 'door.staff@org.test' },
      { id: OUTSIDER_ID, email: 'outsider@elsewhere.test' },
    ],
    org_members: [
      { org_id: ORG, user_id: MEMBER_ID },
      { org_id: OTHER_ORG, user_id: OUTSIDER_ID },
    ],
  }
})

const sessionRows = () => db.check_ins.filter(r => r.session_id === SESSION)

// ── parseScanToken ──────────────────────────────────────────────────────────────

describe('parseScanToken', () => {
  it('parses a GHL ticket token and ignores the signature', () => {
    expect(parseScanToken(ghlToken(HERE_ATTENDEE))).toEqual({ kind: 'ghl', attendeeId: HERE_ATTENDEE })
  })
  it('accepts uppercase hex in a GHL token and lowercases the attendee id', () => {
    expect(parseScanToken(`V1.${HERE_ATTENDEE.toUpperCase()}.${SIG}`)).toEqual({ kind: 'ghl', attendeeId: HERE_ATTENDEE })
  })
  it('rejects a GHL token whose attendee id is the wrong length', () => {
    expect(parseScanToken(`v1.${HERE_ATTENDEE.slice(1)}.${SIG}`)).toEqual({ kind: 'unknown' })
  })
  it('rejects a GHL token whose signature is the wrong length', () => {
    expect(parseScanToken(`v1.${HERE_ATTENDEE}.${SIG.slice(1)}`)).toEqual({ kind: 'unknown' })
  })
  it('parses a 32-hex Prezva QR', () => {
    expect(parseScanToken(PREZVA_QR)).toEqual({ kind: 'prezva', qrCode: PREZVA_QR })
  })
  it('lowercases an uppercase Prezva QR', () => {
    expect(parseScanToken(PREZVA_QR.toUpperCase())).toEqual({ kind: 'prezva', qrCode: PREZVA_QR })
  })
  it('trims surrounding whitespace', () => {
    expect(parseScanToken(`  ${ghlToken(HERE_ATTENDEE)}\n`)).toEqual({ kind: 'ghl', attendeeId: HERE_ATTENDEE })
    expect(parseScanToken(`\t${PREZVA_QR} `)).toEqual({ kind: 'prezva', qrCode: PREZVA_QR })
  })
  it('returns unknown for empty, garbage and URLs', () => {
    expect(parseScanToken('')).toEqual({ kind: 'unknown' })
    expect(parseScanToken('hello world')).toEqual({ kind: 'unknown' })
    expect(parseScanToken(`https://prezva.app/e/x?t=${PREZVA_QR}`)).toEqual({ kind: 'unknown' })
  })
})

// ── Dashboard: orgCheckInToSession ───────────────────────────────────────────────

describe('orgCheckInToSession (dashboard)', () => {
  it('checks in a GHL token registered on this event and stores the staff id', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, ghlToken(HERE_ATTENDEE), 'qr_scan')
    expect(result.success).toBe(true)
    expect(result.registration?.id).toBe('r-ghl')
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-ghl', method: 'qr_scan', checked_in_by: STAFF_ID })])
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: 'r-ghl', stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('refuses a GHL token registered on another event, offers override, never names that event', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, ghlToken(OTHER_ATTENDEE), 'qr_scan')
    expect(result).toEqual({ success: false, error: GHL_TICKET_NOT_REGISTERED, canOverride: true })
    expect(result.error).not.toContain('Secret')
    expect(result.error).not.toContain(OTHER_EVENT)
    expect(sessionRows()).toHaveLength(0)
  })

  it('returns the existing error for an unrecognised string', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, 'garbage', 'qr_scan')
    expect(result).toEqual({ success: false, error: 'QR code not found for this event' })
  })

  it('A2: Prezva QR behaves as before, whatever the case', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, PREZVA_QR.toUpperCase(), 'qr_scan')
    expect(result.success).toBe(true)
    expect(result.registration?.id).toBe('r-prezva')
    expect(result.canOverride).toBeUndefined()
  })

  it('A2: a non-32-hex code still takes the lowercased qr_code lookup', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, 'PREZVA-0C5C7ABC', 'qr_scan')
    expect(result.success).toBe(true)
    expect(result.registration?.id).toBe('r-legacy')
  })

  it('R80: refuses a pending registration', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'qr_scan')
    expect(result).toEqual({ success: false, error: 'Registration is not confirmed' })
  })

  it('stores the staff id on a manual mark', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, 'r-prezva', 'manual')
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ method: 'manual', checked_in_by: STAFF_ID })])
  })
})

describe('checkInToSession (client-callable, O102)', () => {
  const ATTENDEE_ID = '0a1b2c3d-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const as = (identity: SessionIdentity, email?: string) => {
    vi.mocked(getSessionIdentity).mockResolvedValue(identity)
    mockGetUser.mockResolvedValue({ data: { user: email ? { id: ATTENDEE_ID, email } : null } })
  }

  it('refuses an anonymous caller and writes nothing', async () => {
    const result = await checkInToSession('here-event', SESSION)
    expect(result).toEqual({ ok: false, error: 'Sign in to check in' })
    expect(sessionRows()).toHaveLength(0)
    expect(getSessionIdentity).toHaveBeenCalledWith('here-event')
  })

  it('checks in a full-auth caller by user_id, as self with no staff id', async () => {
    db.registrations.find(r => r.id === 'r-prezva')!.user_id = ATTENDEE_ID
    as({ type: 'user', userId: ATTENDEE_ID })
    const result = await checkInToSession('here-event', SESSION)
    expect(result).toEqual({ ok: true, alreadyCheckedIn: false })
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-prezva', method: 'self', checked_in_by: null })])
    expect(mockGetUser).not.toHaveBeenCalled() // user_id hit: no email fallback needed
  })

  it('falls back to the verified auth email (case-insensitive) when user_id is not linked', async () => {
    as({ type: 'user', userId: ATTENDEE_ID }, 'R-Prezva@Test.com')
    const result = await checkInToSession('here-event', SESSION)
    expect(result.ok).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-prezva', method: 'self' })])
  })

  it('refuses a full-auth caller who owns no registration here', async () => {
    as({ type: 'user', userId: ATTENDEE_ID }, 'stranger@test.com')
    expect(await checkInToSession('here-event', SESSION)).toEqual({ ok: false, error: 'Sign in to check in' })
    expect(sessionRows()).toHaveLength(0)
  })

  it('accepts a claim-level caller whose registration is on this event', async () => {
    as({ type: 'registration', registrationId: 'r-ghl', eventId: EVENT })
    const result = await checkInToSession('here-event', SESSION)
    expect(result.ok).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-ghl', method: 'self', checked_in_by: null })])
  })

  it('refuses a claim-level caller whose registration is on ANOTHER event', async () => {
    as({ type: 'registration', registrationId: 'r-other', eventId: OTHER_EVENT })
    expect(await checkInToSession('here-event', SESSION)).toEqual({ ok: false, error: 'Sign in to check in' })
    expect(sessionRows()).toHaveLength(0)
  })

  it('refuses a registration that is not confirmed (claim-level and full-auth)', async () => {
    as({ type: 'registration', registrationId: 'r-pending', eventId: EVENT })
    expect((await checkInToSession('here-event', SESSION)).ok).toBe(false)
    db.registrations.find(r => r.id === 'r-waitlisted')!.user_id = ATTENDEE_ID
    as({ type: 'user', userId: ATTENDEE_ID }, 'r-waitlisted@test.com')
    expect((await checkInToSession('here-event', SESSION)).ok).toBe(false)
    expect(sessionRows()).toHaveLength(0)
  })

  it('ignores any extra client arguments: the row is always self, never override or a staff method', async () => {
    as({ type: 'registration', registrationId: 'r-ghl', eventId: EVENT })
    // A tampered client can still send extra positional args; they must be ignored.
    const call = checkInToSession as unknown as (...a: unknown[]) => ReturnType<typeof checkInToSession>
    expect((await call('here-event', SESSION, 'override', 'r-other')).ok).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-ghl', method: 'self', checked_in_by: null })])
  })

  it('refuses a session from another event even for an owned registration', async () => {
    db.sessions.push({ id: 'sess-other', event_id: OTHER_EVENT })
    as({ type: 'registration', registrationId: 'r-ghl', eventId: EVENT })
    expect((await checkInToSession('here-event', 'sess-other')).ok).toBe(false)
    expect(db.check_ins).toHaveLength(0)
  })

  it('refuses an unknown event slug', async () => {
    expect(await checkInToSession('no-such-event', SESSION)).toEqual({ ok: false, error: 'Event not found' })
    expect(getSessionIdentity).not.toHaveBeenCalled()
  })

  it('staff path unchanged: orgCheckInToSession still records the staff id and method', async () => {
    const result = await orgCheckInToSession(EVENT, SESSION, 'r-prezva', 'manual')
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-prezva', method: 'manual', checked_in_by: STAFF_ID })])
    expect(getSessionIdentity).not.toHaveBeenCalled()
  })

  it('staff path unchanged: an embed manual mark still writes as embed', async () => {
    const result = await embedManualMarkSession(EVENT, SESSION, 'r-prezva')
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-prezva', method: 'manual', checked_in_source: 'embed' })])
    expect(getSessionIdentity).not.toHaveBeenCalled()
  })
})

describe('orgOverrideSessionCheckIn (R81)', () => {
  it("writes method 'override' with the staff id and fires the attendedSession stage move", async () => {
    const result = await orgOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    expect(result.success).toBe(true)
    expect(result.registration?.already_checked_in).toBe(false)
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-ghl', method: 'override', checked_in_by: STAFF_ID })])
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: 'r-ghl', stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('refuses a registration that is not confirmed', async () => {
    for (const id of ['r-pending', 'r-waitlisted']) {
      const result = await orgOverrideSessionCheckIn(EVENT, SESSION, id)
      expect(result).toEqual({ success: false, error: 'Registration is not confirmed' })
    }
    expect(sessionRows()).toHaveLength(0)
  })

  it('refuses a registration from another event', async () => {
    const result = await orgOverrideSessionCheckIn(EVENT, SESSION, 'r-other')
    expect(result).toEqual({ success: false, error: 'Attendee not found' })
    expect(sessionRows()).toHaveLength(0)
  })

  it('returns already-checked-in on a duplicate without a second row', async () => {
    await orgOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    vi.mocked(enqueueGhlStageMove).mockClear()
    const result = await orgOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    expect(result.success).toBe(true)
    expect(result.registration?.already_checked_in).toBe(true)
    expect(sessionRows()).toHaveLength(1)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})

// ── Embedded: embedScanIntoSession / embedManualMarkSession ─────────────────────

describe('embedScanIntoSession (embedded)', () => {
  it('checks in a GHL token registered on this event', async () => {
    const result = await embedScanIntoSession(EVENT, SESSION, ghlToken(HERE_ATTENDEE))
    expect(result.success).toBe(true)
    expect(result.registration?.id).toBe('r-ghl')
    expect(sessionRows()).toEqual([expect.objectContaining({ registration_id: 'r-ghl', method: 'qr_scan', checked_in_source: 'embed' })])
  })

  it('refuses a GHL token registered on another event, offers override, never names that event', async () => {
    const result = await embedScanIntoSession(EVENT, SESSION, ghlToken(OTHER_ATTENDEE))
    expect(result).toEqual({ success: false, error: GHL_TICKET_NOT_REGISTERED, canOverride: true })
    expect(result.error).not.toContain('Secret')
    expect(sessionRows()).toHaveLength(0)
  })

  it('returns the existing error for an unrecognised string', async () => {
    const result = await embedScanIntoSession(EVENT, SESSION, 'garbage')
    expect(result).toEqual({ success: false, error: 'QR code not found for this event' })
  })

  it('A2: Prezva QR behaves as before', async () => {
    const result = await embedScanIntoSession(EVENT, SESSION, PREZVA_QR)
    expect(result.success).toBe(true)
    expect(result.registration?.id).toBe('r-prezva')
  })

  it('R80: refuses pending and waitlisted registrations', async () => {
    for (const code of ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb']) {
      const result = await embedScanIntoSession(EVENT, SESSION, code)
      expect(result).toEqual({ success: false, error: 'Registration is not confirmed' })
    }
    expect(sessionRows()).toHaveLength(0)
  })
})

describe('embedManualMarkSession (embedded)', () => {
  it('R80: refuses pending and waitlisted registrations', async () => {
    for (const id of ['r-pending', 'r-waitlisted']) {
      const result = await embedManualMarkSession(EVENT, SESSION, id)
      expect(result).toEqual({ success: false, error: 'Registration is not confirmed' })
    }
    expect(sessionRows()).toHaveLength(0)
  })
})

// ── Embedded staff identity (R81, Paul: C + A) ──────────────────────────────────

describe('embedded staff identity', () => {
  it('scan by an org member records the normalised email and the member profile id', async () => {
    embedAs('  Door.Staff@ORG.test ')
    const result = await embedScanIntoSession(EVENT, SESSION, ghlToken(HERE_ATTENDEE))
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({
      method: 'qr_scan', checked_in_by: MEMBER_ID, checked_in_by_email: 'door.staff@org.test', checked_in_source: 'embed',
    })])
  })

  it('manual mark records the email the same way', async () => {
    embedAs('door.staff@org.test')
    const result = await embedManualMarkSession(EVENT, SESSION, 'r-prezva')
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({
      method: 'manual', checked_in_by: MEMBER_ID, checked_in_by_email: 'door.staff@org.test',
    })])
  })

  it('a profile that is not a member of this org fills only checked_in_by_email', async () => {
    embedAs('outsider@elsewhere.test')
    await embedScanIntoSession(EVENT, SESSION, PREZVA_QR)
    expect(sessionRows()).toEqual([expect.objectContaining({ checked_in_by: null, checked_in_by_email: 'outsider@elsewhere.test' })])
  })

  it('an email with no Prezva profile fills only checked_in_by_email', async () => {
    embedAs('ghl.only@agency.test')
    await embedManualMarkSession(EVENT, SESSION, 'r-prezva')
    expect(sessionRows()).toEqual([expect.objectContaining({ checked_in_by: null, checked_in_by_email: 'ghl.only@agency.test' })])
  })

  it('missing email never blocks a scan: both identity fields null', async () => {
    const result = await embedScanIntoSession(EVENT, SESSION, PREZVA_QR)
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ checked_in_by: null, checked_in_by_email: null, checked_in_source: 'embed' })])
  })
})

describe('embedOverrideSessionCheckIn (R81)', () => {
  it("writes method 'override' with the staff email and fires the attendedSession stage move", async () => {
    embedAs('ghl.only@agency.test')
    const result = await embedOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    expect(result.success).toBe(true)
    expect(result.registration?.already_checked_in).toBe(false)
    expect(sessionRows()).toEqual([expect.objectContaining({
      registration_id: 'r-ghl', method: 'override', checked_in_by: null, checked_in_by_email: 'ghl.only@agency.test', checked_in_source: 'embed',
    })])
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: 'r-ghl', stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('a member email also fills checked_in_by', async () => {
    embedAs('door.staff@org.test')
    await embedOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    expect(sessionRows()).toEqual([expect.objectContaining({ method: 'override', checked_in_by: MEMBER_ID, checked_in_by_email: 'door.staff@org.test' })])
  })

  it('missing email never blocks an override: both identity fields null', async () => {
    const result = await embedOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    expect(result.success).toBe(true)
    expect(sessionRows()).toEqual([expect.objectContaining({ method: 'override', checked_in_by: null, checked_in_by_email: null })])
  })

  it('refuses a registration that is not confirmed', async () => {
    for (const id of ['r-pending', 'r-waitlisted']) {
      const result = await embedOverrideSessionCheckIn(EVENT, SESSION, id)
      expect(result).toEqual({ success: false, error: 'Registration is not confirmed' })
    }
    expect(sessionRows()).toHaveLength(0)
  })

  it('refuses a registration from another event', async () => {
    const result = await embedOverrideSessionCheckIn(EVENT, SESSION, 'r-other')
    expect(result).toEqual({ success: false, error: 'Attendee not found' })
    expect(sessionRows()).toHaveLength(0)
  })

  it('returns already-checked-in on a duplicate without a second row', async () => {
    await embedOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    vi.mocked(enqueueGhlStageMove).mockClear()
    const result = await embedOverrideSessionCheckIn(EVENT, SESSION, 'r-ghl')
    expect(result.success).toBe(true)
    expect(result.registration?.already_checked_in).toBe(true)
    expect(sessionRows()).toHaveLength(1)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})
