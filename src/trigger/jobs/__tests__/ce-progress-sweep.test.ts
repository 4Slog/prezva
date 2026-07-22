import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk/v3', () => ({
  schedules: { task: (opts: any) => opts },
}))

vi.mock('../../lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlPut: vi.fn(),
  ghlAddContactTags: vi.fn(),
  ghlRemoveContactTags: vi.fn(),
}))

vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
}))

vi.mock('@/lib/certificates/eligibility', () => ({
  checkEligibility: vi.fn(),
}))

vi.mock('@/lib/integrations/ghl/location', () => ({
  ghlLocationIdForOrg: vi.fn(),
}))

// Partial mock: keep the real buildStageTagMaps (config.ts calls it at module
// load) and only stub getGhlOrgConfig, which this test controls per-case.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

import {
  findCeProgressCandidates,
  processCeProgressCandidate,
  runCeProgressSweepForEvent,
  type CeProgressCandidate,
} from '../ce-progress-sweep'
import { ghlPut, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { checkEligibility } from '@/lib/certificates/eligibility'
import { ghlLocationIdForOrg } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  GHL_FIELD_KEYS,
  GHL_LIFECYCLE_TAGS,
  GHL_STAGE_IDS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
  GHL_EVENTS_PIPELINE_ID,
} from '@/lib/integrations/ghl/config'

const TOKEN = 'test-token'
const OPP_ID = 'opp-1'
const CONTACT_ID = 'contact-1'
const EVENT_ID = 'event-1'
const ORG_ID = 'org-1'
const LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'

// Built from the legacy constants so this fixture can't drift from production values.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS,
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
}

function baseCandidate(overrides: Partial<CeProgressCandidate> = {}): CeProgressCandidate {
  return {
    registrationId: 'reg-1',
    syncStateId: 'sync-1',
    ghlOpportunityId: OPP_ID,
    ghlContactId: CONTACT_ID,
    lastPushedAttendancePct: null,
    lastPushedCeCredits: null,
    ...overrides,
  }
}

function buildUpdateOnlyResolver() {
  return (call: Recorded) => {
    if (call.table === 'ghl_sync_state' && call.mode === 'update') return { data: null, error: null }
    throw new Error(`unexpected call in test: ${call.table} ${call.mode}`)
  }
}

beforeEach(() => {
  vi.mocked(ghlPut).mockReset().mockResolvedValue({} as any)
  vi.mocked(ghlAddContactTags).mockReset().mockResolvedValue([])
  vi.mocked(ghlRemoveContactTags).mockReset().mockResolvedValue([])
  vi.mocked(checkEligibility).mockReset()
  vi.mocked(ghlLocationIdForOrg).mockReset().mockResolvedValue(LOCATION_ID)
  vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue(TOKEN)
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
})

describe('processCeProgressCandidate', () => {
  it('partial attendance (3/5, not eligible) PUTs pct=60 + credits, ADDs prezva-ce-incomplete', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: false, sessionsAttended: 3, sessionsTotal: 5, ceCredits: 4.5,
    })
    const { admin } = makeFakeAdmin(buildUpdateOnlyResolver())

    const result = await processCeProgressCandidate(admin as any, TOKEN, baseCandidate(), SAUP_CONFIG)

    expect(ghlPut).toHaveBeenCalledWith(TOKEN, `/opportunities/${OPP_ID}`, {
      customFields: [
        { id: GHL_FIELD_KEYS.prezvaAttendancePct, value: 60 },
        { id: GHL_FIELD_KEYS.prezvaCeCredits, value: 4.5 },
      ],
    })
    expect(ghlAddContactTags).toHaveBeenCalledWith(TOKEN, CONTACT_ID, [GHL_LIFECYCLE_TAGS.ceIncomplete])
    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
    expect(result).toEqual({ updated: true, pct: 60, credits: 4.5 })
  })

  it('eligible registration PUTs fields and REMOVEs prezva-ce-incomplete', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 5, sessionsTotal: 5, ceCredits: 7.5,
    })
    const { admin } = makeFakeAdmin(buildUpdateOnlyResolver())

    const result = await processCeProgressCandidate(admin as any, TOKEN, baseCandidate(), SAUP_CONFIG)

    expect(ghlPut).toHaveBeenCalledWith(TOKEN, `/opportunities/${OPP_ID}`, {
      customFields: [
        { id: GHL_FIELD_KEYS.prezvaAttendancePct, value: 100 },
        { id: GHL_FIELD_KEYS.prezvaCeCredits, value: 7.5 },
      ],
    })
    expect(ghlRemoveContactTags).toHaveBeenCalledWith(TOKEN, CONTACT_ID, [GHL_LIFECYCLE_TAGS.ceIncomplete])
    expect(ghlAddContactTags).not.toHaveBeenCalled()
    expect(result).toEqual({ updated: true, pct: 100, credits: 7.5 })
  })

  it('sessionsAttended === 0 (real no-show) does not add or remove the ce-incomplete tag', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: false, sessionsAttended: 0, sessionsTotal: 5, ceCredits: 0,
    })
    const { admin } = makeFakeAdmin(buildUpdateOnlyResolver())

    await processCeProgressCandidate(admin as any, TOKEN, baseCandidate(), SAUP_CONFIG)

    expect(ghlAddContactTags).not.toHaveBeenCalled()
    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
    expect(ghlPut).toHaveBeenCalled()
  })

  it('dedup: unchanged pct+credits makes zero GHL calls', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: false, sessionsAttended: 3, sessionsTotal: 5, ceCredits: 4.5,
    })
    const { admin } = makeFakeAdmin(buildUpdateOnlyResolver())

    const result = await processCeProgressCandidate(
      admin as any,
      TOKEN,
      baseCandidate({ lastPushedAttendancePct: 60, lastPushedCeCredits: 4.5 }),
      SAUP_CONFIG,
    )

    expect(ghlPut).not.toHaveBeenCalled()
    expect(ghlAddContactTags).not.toHaveBeenCalled()
    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
    expect(result).toEqual({ skipped: true, reason: 'unchanged' })
  })

  it('null ghl_contact_id: no tag calls, field PUT still attempted', async () => {
    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 5, sessionsTotal: 5, ceCredits: 7.5,
    })
    const { admin } = makeFakeAdmin(buildUpdateOnlyResolver())

    await processCeProgressCandidate(admin as any, TOKEN, baseCandidate({ ghlContactId: null }), SAUP_CONFIG)

    expect(ghlPut).toHaveBeenCalled()
    expect(ghlAddContactTags).not.toHaveBeenCalled()
    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
  })
})

describe('findCeProgressCandidates', () => {
  it('returns confirmed, synced registrations that have an opportunity id, skipping parked rows', async () => {
    const resolver = (call: Recorded) => {
      if (call.table === 'registrations') {
        return {
          data: [
            { id: 'reg-good' },
            { id: 'reg-parked' },
          ],
          error: null,
        }
      }
      if (call.table === 'ghl_sync_state') {
        return {
          data: [
            {
              id: 'sync-good', internal_registration_id: 'reg-good', ghl_opportunity_id: 'opp-good',
              ghl_contact_id: 'contact-good', last_pushed_attendance_pct: null, last_pushed_ce_credits: null,
            },
            {
              id: 'sync-parked', internal_registration_id: 'reg-parked', ghl_opportunity_id: null,
              ghl_contact_id: null, last_pushed_attendance_pct: null, last_pushed_ce_credits: null,
            },
          ],
          error: null,
        }
      }
      throw new Error(`unexpected table: ${call.table}`)
    }
    const { admin } = makeFakeAdmin(resolver)

    const result = await findCeProgressCandidates(admin as any, EVENT_ID)

    expect(result).toEqual([
      {
        registrationId: 'reg-good',
        syncStateId: 'sync-good',
        ghlOpportunityId: 'opp-good',
        ghlContactId: 'contact-good',
        lastPushedAttendancePct: null,
        lastPushedCeCredits: null,
      },
    ])
  })
})

describe('runCeProgressSweepForEvent — failure isolation', () => {
  it('a throwing ghl call for one registration does not abort the others', async () => {
    const candidates: CeProgressCandidate[] = [
      baseCandidate({ registrationId: 'reg-fail', syncStateId: 'sync-fail', ghlOpportunityId: 'opp-fail', ghlContactId: 'contact-fail' }),
      baseCandidate({ registrationId: 'reg-ok', syncStateId: 'sync-ok', ghlOpportunityId: 'opp-ok', ghlContactId: 'contact-ok' }),
    ]
    const resolver = (call: Recorded) => {
      if (call.table === 'events') {
        return { data: { org_id: ORG_ID }, error: null }
      }
      if (call.table === 'registrations') {
        return { data: candidates.map((c) => ({ id: c.registrationId })), error: null }
      }
      if (call.table === 'ghl_sync_state' && call.mode === 'select') {
        return {
          data: candidates.map((c) => ({
            id: c.syncStateId,
            internal_registration_id: c.registrationId,
            ghl_opportunity_id: c.ghlOpportunityId,
            ghl_contact_id: c.ghlContactId,
            last_pushed_attendance_pct: c.lastPushedAttendancePct,
            last_pushed_ce_credits: c.lastPushedCeCredits,
          })),
          error: null,
        }
      }
      if (call.table === 'ghl_sync_state' && call.mode === 'update') return { data: null, error: null }
      throw new Error(`unexpected call: ${call.table} ${call.mode}`)
    }
    const { admin } = makeFakeAdmin(resolver)

    vi.mocked(checkEligibility).mockResolvedValue({
      eligible: true, sessionsAttended: 5, sessionsTotal: 5, ceCredits: 7.5,
    })
    vi.mocked(ghlPut)
      .mockRejectedValueOnce(new Error('GHL boom'))
      .mockResolvedValueOnce({} as any)

    const result = await runCeProgressSweepForEvent(admin as any, EVENT_ID)

    expect(result).toEqual({ processed: 2, updated: 1 })
    expect(ghlPut).toHaveBeenCalledTimes(2)
  })
})

describe('config — GHL_STAGE_SUPERSEDES_TAGS certificateIssued', () => {
  it('contains both prezva-no-show and prezva-ce-incomplete', () => {
    expect(GHL_STAGE_SUPERSEDES_TAGS[GHL_STAGE_IDS.certificateIssued]).toEqual([
      GHL_LIFECYCLE_TAGS.noShow,
      GHL_LIFECYCLE_TAGS.ceIncomplete,
    ])
  })
})
