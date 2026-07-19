import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'fake-embed-token' }) }),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn().mockResolvedValue({ location_id: 'loc_1' }),
  COOKIE_NAME: 'embed_session',
}))
vi.mock('@/lib/trigger', () => ({
  enqueueGhlStageMove: vi.fn().mockResolvedValue(null),
}))
// Partial mock: keep the real buildStageTagMaps (config.ts calls it at module
// load) and only stub getGhlOrgConfig, which this test controls directly.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { checkInByQR, checkInBySearch, processOfflineQueue, embedScanIntoSession, embedManualMarkSession } from '@/lib/embedded/checkin-actions'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  GHL_STAGE_IDS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_FIELD_KEYS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

// Built from the legacy constants so this fixture can't drift from production values.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS,
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
}

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG_ID   = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG_ID   = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const QR_CODE  = 'PREZVA-123456-ABC123'

const mockLink  = { org_id: ORG_ID }
const mockEvent = { id: EVENT_ID, org_id: ORG_ID }

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'eq', 'is']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.single = vi.fn()
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'insert', 'eq', 'is']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

function setupRefundedReg() {
  const refundedReg = {
    id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com',
    status: 'refunded', ticket_types: { name: 'General' },
  }
  mockFromImpl = (t) => {
    if (t === 'ghl_location_links') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockLink, error: null }) })
    if (t === 'events') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
    if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
    return makeChain()
  }
}

describe('embedded checkInByQR', () => {
  it('returns error for refunded registration', async () => {
    setupRefundedReg()
    const result = await checkInByQR(EVENT_ID, QR_CODE)
    expect(result.success).toBe(false)
    expect(result.error).toContain('refunded')
  })
})

describe('embedded checkInBySearch', () => {
  it('returns error for refunded registration', async () => {
    setupRefundedReg()
    const result = await checkInBySearch(EVENT_ID, REG_ID)
    expect(result.success).toBe(false)
    expect(result.error).toContain('refunded')
  })
})

describe('embedded processOfflineQueue (checkInByQRInternal)', () => {
  it('rejects a refunded entry in the offline batch', async () => {
    const refundedReg = {
      id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com',
      status: 'refunded', ticket_types: { name: 'General' },
    }
    mockFromImpl = (t) => {
      if (t === 'ghl_location_links') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockLink, error: null }) })
      if (t === 'events') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: EVENT_ID }, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
      return makeChain()
    }
    const result = await processOfflineQueue({
      eventId: EVENT_ID,
      deviceId: 'scanner-1',
      entries: [{ qr_code: QR_CODE, scanned_at: new Date().toISOString() }],
    })
    expect((result as any).processed).toBe(0)
    expect((result as any).failedQrCodes).toEqual([QR_CODE])
    expect((result as any).errors[0]).toContain('refunded')
  })
})

// ── embedScanIntoSession / embedManualMarkSession — GHL stage move (doors 3 & 4) ─

describe('embedScanIntoSession / embedManualMarkSession — GHL stage move', () => {
  const SESSION_ID = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
  const confirmedReg = { id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com', status: 'confirmed', ticket_types: { name: 'General' } }

  beforeEach(() => {
    vi.mocked(enqueueGhlStageMove).mockClear()
    vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
  })

  function setupSessionTables(opts: { existingCheckIn: any; insertError?: any }) {
    mockFromImpl = (t) => {
      if (t === 'ghl_location_links') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockLink, error: null }) })
      if (t === 'events') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'sessions') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: SESSION_ID }, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: confirmedReg, error: null }) })
      if (t === 'check_ins') return makeChain({
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.existingCheckIn, error: null }),
        insert: vi.fn().mockReturnValue({ error: opts.insertError ?? null }),
      })
      return makeChain()
    }
  }

  it('embedScanIntoSession fires enqueueGhlStageMove exactly once with attendedSession stage on new attendance', async () => {
    setupSessionTables({ existingCheckIn: null })
    const result = await embedScanIntoSession(EVENT_ID, SESSION_ID, QR_CODE)
    expect(result.success).toBe(true)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: REG_ID, stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('embedScanIntoSession does not fire enqueueGhlStageMove when already checked in', async () => {
    setupSessionTables({ existingCheckIn: { id: 'existing-checkin', checked_in_at: new Date().toISOString() } })
    const result = await embedScanIntoSession(EVENT_ID, SESSION_ID, QR_CODE)
    expect(result.registration?.already_checked_in).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })

  it('embedManualMarkSession fires enqueueGhlStageMove exactly once with attendedSession stage on new attendance', async () => {
    setupSessionTables({ existingCheckIn: null })
    const result = await embedManualMarkSession(EVENT_ID, SESSION_ID, REG_ID)
    expect(result.success).toBe(true)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: REG_ID, stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('embedManualMarkSession does not fire enqueueGhlStageMove when already checked in', async () => {
    setupSessionTables({ existingCheckIn: { id: 'existing-checkin', checked_in_at: new Date().toISOString() } })
    const result = await embedManualMarkSession(EVENT_ID, SESSION_ID, REG_ID)
    expect(result.registration?.already_checked_in).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})
