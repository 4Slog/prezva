import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'attendee@test.com' }),
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

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { markSessionAttendance } from '@/lib/checkin/session-checkin-actions'
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

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const SESSION_ID = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
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
  for (const k of ['select', 'insert', 'eq']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'insert', 'eq']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

// existingPoint truthy short-circuits the dynamic awardPoints import — irrelevant to GHL firing.
function setupTables(opts: { existingAttendance: any; insertError?: any }) {
  mockFromImpl = (t) => {
    if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: REG_ID, user_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }, error: null }) })
    if (t === 'sessions') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: SESSION_ID }, error: null }) })
    if (t === 'events') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { org_id: ORG_ID }, error: null }) })
    if (t === 'session_attendance') return makeChain({
      maybeSingle: vi.fn().mockResolvedValue({ data: opts.existingAttendance, error: null }),
      insert: vi.fn().mockReturnValue({ error: opts.insertError ?? null }),
    })
    if (t === 'leaderboard_points') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-point' }, error: null }) })
    return makeChain()
  }
}

describe('markSessionAttendance — GHL stage move (door 1)', () => {
  beforeEach(() => {
    vi.mocked(enqueueGhlStageMove).mockClear()
    vi.mocked(ghlLocationIdForOrg).mockReset().mockResolvedValue(LOCATION_ID)
    vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
  })

  it('fires enqueueGhlStageMove exactly once with attendedSession stage on new attendance', async () => {
    setupTables({ existingAttendance: null })
    const result = await markSessionAttendance(SESSION_ID, EVENT_ID)
    expect(result.ok).toBe(true)
    expect(result.alreadyMarked).toBe(false)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: REG_ID, stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('does not fire enqueueGhlStageMove when attendance already recorded', async () => {
    setupTables({ existingAttendance: { id: 'existing-attendance' } })
    const result = await markSessionAttendance(SESSION_ID, EVENT_ID)
    expect(result.ok).toBe(true)
    expect(result.alreadyMarked).toBe(true)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})
