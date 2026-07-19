import { describe, it, expect, vi } from 'vitest'
import { getGhlOrgConfig, buildStageTagMaps } from './org-config'
import { GHL_STAGE_IDS, GHL_LIFECYCLE_TAGS } from './config'

function makeAdmin(row: any) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
    })),
  }
}

const FULL_STAGE_IDS = { ...GHL_STAGE_IDS }
const FULL_FIELD_IDS = {
  prezvaEventId: 'f1',
  prezvaRegistrationId: 'f2',
  prezvaTicketType: 'f3',
  prezvaPaymentStatus: 'f4',
  prezvaSource: 'f5',
  prezvaLastSyncTime: 'f6',
  prezvaAttendeeLink: 'f7',
  prezvaCeCredits: 'f8',
  prezvaAttendancePct: 'f9',
}

describe('getGhlOrgConfig', () => {
  it('row present -> returns full config with derived stage tag maps', async () => {
    const admin = makeAdmin({ pipeline_id: 'pipe-1', stage_ids: FULL_STAGE_IDS, field_ids: FULL_FIELD_IDS })

    const config = await getGhlOrgConfig(admin as any, 'org-1')

    expect(config).not.toBeNull()
    expect(config!.pipelineId).toBe('pipe-1')
    expect(config!.stageIds).toEqual(FULL_STAGE_IDS)
    expect(config!.fieldIds).toEqual(FULL_FIELD_IDS)
    expect(config!.stageTags[FULL_STAGE_IDS.confirmed]).toBe(GHL_LIFECYCLE_TAGS.confirmed)
    expect(config!.stageTags[FULL_STAGE_IDS.attendedSession]).toBe(GHL_LIFECYCLE_TAGS.attended)
    expect(config!.stageSupersedesTags[FULL_STAGE_IDS.certificateIssued]).toEqual([
      GHL_LIFECYCLE_TAGS.noShow,
      GHL_LIFECYCLE_TAGS.ceIncomplete,
    ])
  })

  it('row missing -> returns null', async () => {
    const admin = makeAdmin(null)

    const config = await getGhlOrgConfig(admin as any, 'org-missing')

    expect(config).toBeNull()
  })

  it('row with a missing stage key -> throws naming the missing key', async () => {
    const { certificateIssued: _drop, ...partialStageIds } = FULL_STAGE_IDS
    const admin = makeAdmin({ pipeline_id: 'pipe-1', stage_ids: partialStageIds, field_ids: FULL_FIELD_IDS })

    await expect(getGhlOrgConfig(admin as any, 'org-1')).rejects.toThrow(/certificateIssued/)
  })

  it('row with a missing field key -> throws naming the missing key, never half-firing', async () => {
    const { prezvaCeCredits: _drop, ...partialFieldIds } = FULL_FIELD_IDS
    const admin = makeAdmin({ pipeline_id: 'pipe-1', stage_ids: FULL_STAGE_IDS, field_ids: partialFieldIds })

    await expect(getGhlOrgConfig(admin as any, 'org-1')).rejects.toThrow(/prezvaCeCredits/)
  })
})

describe('buildStageTagMaps', () => {
  it('derives stageTags/stageSupersedesTags matching the legacy config.ts derivation', () => {
    const { stageTags, stageSupersedesTags } = buildStageTagMaps(GHL_STAGE_IDS)

    expect(stageTags[GHL_STAGE_IDS.confirmed]).toBe(GHL_LIFECYCLE_TAGS.confirmed)
    expect(stageTags[GHL_STAGE_IDS.checkedIn]).toBe(GHL_LIFECYCLE_TAGS.checkedIn)
    expect(stageTags[GHL_STAGE_IDS.attendedSession]).toBe(GHL_LIFECYCLE_TAGS.attended)
    expect(stageTags[GHL_STAGE_IDS.noShow]).toBe(GHL_LIFECYCLE_TAGS.noShow)
    expect(stageTags[GHL_STAGE_IDS.certificateIssued]).toBe(GHL_LIFECYCLE_TAGS.certIssued)
    expect(stageTags[GHL_STAGE_IDS.registered]).toBeUndefined()

    expect(stageSupersedesTags[GHL_STAGE_IDS.checkedIn]).toEqual([GHL_LIFECYCLE_TAGS.noShow])
    expect(stageSupersedesTags[GHL_STAGE_IDS.attendedSession]).toEqual([GHL_LIFECYCLE_TAGS.noShow])
    expect(stageSupersedesTags[GHL_STAGE_IDS.certificateIssued]).toEqual([
      GHL_LIFECYCLE_TAGS.noShow,
      GHL_LIFECYCLE_TAGS.ceIncomplete,
    ])
  })
})
