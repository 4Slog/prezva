import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueGhlStageMove: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/integrations/ghl/location', () => ({
  ghlLocationIdForOrg: vi.fn(),
}))
// Partial mock: keep the real buildStageTagMaps (config.ts calls it at module
// load) and only stub getGhlOrgConfig, which this test controls directly.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})
vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  pinLookupLimiter: {},
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue(null) }),
}))

const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
  })),
}))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { selfCheckInByToken, selfCheckInRegistration, selfCheckInByEmailPin } from '@/lib/checkin/self-checkin-actions'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  GHL_STAGE_IDS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_FIELD_KEYS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

const ORG_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'

// Built from the legacy constants so this fixture can't drift from production values.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS,
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
}

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'eq', 'is']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'insert', 'eq', 'is']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

const TOKEN = 'PREZVA-123456-ABC123'

describe('selfCheckInByToken', () => {
  it('returns error for refunded registration', async () => {
    const refundedReg = {
      id: 'reg-1', user_id: null, attendee_name: 'Alice', attendee_email: 'alice@test.com',
      status: 'refunded', event_id: 'event-1',
      events: { id: 'event-1', title: 'Test Event', start_at: new Date().toISOString(), timezone: 'UTC', slug: 'test-event' },
    }
    mockFromImpl = (t) => {
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
      return makeChain()
    }
    const result = await selfCheckInByToken(TOKEN)
    expect(result.success).toBe(false)
    expect(result.error).toContain('refunded')
  })
})

// ── selfCheckInRegistration — GHL stage move (door 6) ───────────────────────────

describe('selfCheckInRegistration — GHL stage move', () => {
  const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const SESSION_ID = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const confirmedReg = {
    id: REG_ID, user_id: USER_ID, attendee_name: 'Alice', status: 'confirmed', event_id: 'event-1',
    events: { id: 'event-1', title: 'Test Event', start_at: new Date().toISOString(), timezone: 'UTC', org_id: ORG_ID },
  }

  beforeEach(() => {
    vi.mocked(enqueueGhlStageMove).mockClear()
    vi.mocked(ghlLocationIdForOrg).mockReset().mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
  })

  function setupTables(opts: { existingCheckIn: any; insertError?: any }) {
    mockFromImpl = (t) => {
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: confirmedReg, error: null }) })
      if (t === 'check_ins') return makeChain({
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.existingCheckIn, error: null }),
        insert: vi.fn().mockReturnValue({ error: opts.insertError ?? null }),
      })
      return makeChain()
    }
  }

  it('fires enqueueGhlStageMove exactly once with attendedSession stage on new SESSION attendance', async () => {
    setupTables({ existingCheckIn: null })
    const result = await selfCheckInRegistration(REG_ID, SESSION_ID)
    expect(result.success).toBe(true)
    expect(result.already_checked_in).toBe(false)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: REG_ID, stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('does not fire enqueueGhlStageMove on repeat SESSION check-in', async () => {
    setupTables({ existingCheckIn: { id: 'existing', checked_in_at: new Date().toISOString() } })
    const result = await selfCheckInRegistration(REG_ID, SESSION_ID)
    expect(result.already_checked_in).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })

  it('does not fire attendedSession for the EVENT-scope branch (sessionId null)', async () => {
    setupTables({ existingCheckIn: null })
    const result = await selfCheckInRegistration(REG_ID, null)
    expect(result.success).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})

// ── selfCheckInByEmailPin — GHL stage move (door 7) ─────────────────────────────

describe('selfCheckInByEmailPin — GHL stage move', () => {
  const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const SESSION_ID = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const PIN = '1234'
  const confirmedReg = {
    id: REG_ID, user_id: USER_ID, attendee_name: 'Alice', pin: PIN, status: 'confirmed', event_id: EVENT_ID,
    events: { id: EVENT_ID, title: 'Test Event', start_at: new Date().toISOString(), timezone: 'UTC', org_id: ORG_ID },
  }

  beforeEach(() => {
    vi.mocked(enqueueGhlStageMove).mockClear()
    vi.mocked(ghlLocationIdForOrg).mockReset().mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
  })

  function setupTables(opts: { existingCheckIn: any; insertError?: any }) {
    mockFromImpl = (t) => {
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: confirmedReg, error: null }) })
      if (t === 'check_ins') return makeChain({
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.existingCheckIn, error: null }),
        insert: vi.fn().mockReturnValue({ error: opts.insertError ?? null }),
      })
      return makeChain()
    }
  }

  it('fires enqueueGhlStageMove exactly once with attendedSession stage on new SESSION attendance', async () => {
    setupTables({ existingCheckIn: null })
    const result = await selfCheckInByEmailPin(EVENT_ID, SESSION_ID, 'alice@test.com', PIN)
    expect(result.success).toBe(true)
    expect(result.already_checked_in).toBe(false)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: REG_ID, stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('does not fire enqueueGhlStageMove on repeat SESSION check-in', async () => {
    setupTables({ existingCheckIn: { id: 'existing', checked_in_at: new Date().toISOString() } })
    const result = await selfCheckInByEmailPin(EVENT_ID, SESSION_ID, 'alice@test.com', PIN)
    expect(result.already_checked_in).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })

  it('does not fire attendedSession for the EVENT-scope branch (sessionId null)', async () => {
    setupTables({ existingCheckIn: null })
    const result = await selfCheckInByEmailPin(EVENT_ID, null, 'alice@test.com', PIN)
    expect(result.success).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})
