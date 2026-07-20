import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client', () => ({
  ghlGet: vi.fn(),
  ghlPost: vi.fn(),
}))

import { ghlGet, ghlPost } from './client'
import { provisionGhlOrgConfig } from './provisioner'

const LOCATION_ID = 'loc-1'
const ORG_ID = 'org-1'
const TOKEN = 'token-1'

const STAGE_NAMES = [
  'Registered',
  'Payment Pending',
  'Confirmed',
  'Checked In',
  'Attended Session',
  'No Show',
  'Certificate Issued',
  'Follow-Up Complete',
]

const STAGE_KEY_BY_NAME: Record<string, string> = {
  Registered: 'registered',
  'Payment Pending': 'paymentPending',
  Confirmed: 'confirmed',
  'Checked In': 'checkedIn',
  'Attended Session': 'attendedSession',
  'No Show': 'noShow',
  'Certificate Issued': 'certificateIssued',
  'Follow-Up Complete': 'followUpComplete',
}

const FIELD_DEFS = [
  { name: 'Prezva Event ID', model: 'opportunity', dataType: 'TEXT', key: 'prezvaEventId' },
  { name: 'Prezva Registration ID', model: 'opportunity', dataType: 'TEXT', key: 'prezvaRegistrationId' },
  { name: 'Prezva Ticket Type', model: 'opportunity', dataType: 'TEXT', key: 'prezvaTicketType' },
  { name: 'Prezva Payment Status', model: 'opportunity', dataType: 'TEXT', key: 'prezvaPaymentStatus' },
  { name: 'Prezva Source', model: 'opportunity', dataType: 'TEXT', key: 'prezvaSource' },
  { name: 'Prezva Last Sync Time', model: 'opportunity', dataType: 'TEXT', key: 'prezvaLastSyncTime' },
  { name: 'Prezva CE Credits', model: 'opportunity', dataType: 'NUMERICAL', key: 'prezvaCeCredits' },
  { name: 'Prezva Attendance %', model: 'opportunity', dataType: 'NUMERICAL', key: 'prezvaAttendancePct' },
  { name: 'Prezva Attendee Link', model: 'contact', dataType: 'TEXT', key: 'prezvaAttendeeLink' },
] as const

function fullPipeline(stageNames: string[] = STAGE_NAMES) {
  return {
    id: 'pipe-existing',
    name: 'Events',
    stages: stageNames.map((name, i) => ({
      id: `stage-${STAGE_KEY_BY_NAME[name]}`,
      name,
      position: i,
    })),
  }
}

function fullCustomFields(presentKeys: string[] = FIELD_DEFS.map((f) => f.key)) {
  return {
    customFields: FIELD_DEFS.filter((f) => presentKeys.includes(f.key)).map((f) => ({
      id: `field-${f.key}`,
      name: f.name,
      model: f.model,
      dataType: f.dataType,
    })),
  }
}

function makeAdmin() {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null })
  const from = vi.fn(() => ({ upsert }))
  return { admin: { from }, upsert, from }
}

describe('provisionGhlOrgConfig', () => {
  beforeEach(() => {
    vi.mocked(ghlGet).mockReset()
    vi.mocked(ghlPost).mockReset()
  })

  it('(a) pipeline exists -> reused, not created', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlPost).not.toHaveBeenCalled()
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ pipeline_id: 'pipe-existing' }),
      { onConflict: 'org_id' },
    )
  })

  it('(b) pipeline absent -> created with 8 stages, IDs captured', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === '/opportunities/pipelines') {
        expect(body).toEqual({
          name: 'Events',
          locationId: LOCATION_ID,
          useOpportunityProbability: false,
          stages: STAGE_NAMES.map((name, i) => ({ name, position: i })),
        })
        return {
          id: 'pipe-new',
          name: 'Events',
          stages: STAGE_NAMES.map((name, i) => ({ id: `newstage-${STAGE_KEY_BY_NAME[name]}`, name, position: i })),
        } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        pipeline_id: 'pipe-new',
        stage_ids: expect.objectContaining({
          registered: 'newstage-registered',
          noShow: 'newstage-noShow',
          followUpComplete: 'newstage-followUpComplete',
        }),
      }),
      { onConflict: 'org_id' },
    )
  })

  it('(c) fields: absent -> created, present -> reused', async () => {
    const presentKeys = ['prezvaEventId', 'prezvaRegistrationId', 'prezvaTicketType', 'prezvaPaymentStatus', 'prezvaSource']
    const missingDefs = FIELD_DEFS.filter((f) => !presentKeys.includes(f.key))

    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields(presentKeys) as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === `/locations/${LOCATION_ID}/customFields`) {
        const def = missingDefs.find((d) => d.name === body.name)
        expect(def).toBeTruthy()
        expect(body).toEqual({ name: def!.name, dataType: def!.dataType, model: def!.model })
        return { customField: { id: `created-${def!.key}`, name: def!.name, model: def!.model, dataType: def!.dataType } } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(ghlPost).toHaveBeenCalledTimes(missingDefs.length)
    const call = upsert.mock.calls[0][0]
    expect(call.field_ids.prezvaEventId).toBe('field-prezvaEventId')
    expect(call.field_ids.prezvaCeCredits).toBe('created-prezvaCeCredits')
    expect(call.field_ids.prezvaAttendeeLink).toBe('created-prezvaAttendeeLink')
  })

  it('(d1) pipeline missing a required stage -> throws, no upsert', async () => {
    const incompleteStageNames = STAGE_NAMES.filter((n) => n !== 'No Show')
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline(incompleteStageNames)] } as any
      if (path.includes('/customFields')) return fullCustomFields() as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await expect(provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)).rejects.toThrow(/No Show/)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('(d2) field create response has no id -> throws, no upsert', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [fullPipeline()] } as any
      if (path.includes('/customFields')) return fullCustomFields([]) as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path) => {
      if (path === `/locations/${LOCATION_ID}/customFields`) return {} as any
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await expect(provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)).rejects.toThrow(/returned no id/)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('(e) full success -> single upsert with all 17 keys and provisioned_by', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token, path) => {
      if (path.startsWith('/opportunities/pipelines')) return { pipelines: [] } as any
      if (path.includes('/customFields')) return fullCustomFields([]) as any
      throw new Error(`unexpected ghlGet path: ${path}`)
    })
    vi.mocked(ghlPost).mockImplementation(async (_token, path, body: any) => {
      if (path === '/opportunities/pipelines') {
        return {
          id: 'pipe-full',
          name: 'Events',
          stages: STAGE_NAMES.map((name, i) => ({ id: `s-${STAGE_KEY_BY_NAME[name]}`, name, position: i })),
        } as any
      }
      if (path === `/locations/${LOCATION_ID}/customFields`) {
        const def = FIELD_DEFS.find((d) => d.name === body.name)!
        return { customField: { id: `f-${def.key}`, name: def.name, model: def.model, dataType: def.dataType } } as any
      }
      throw new Error(`unexpected ghlPost path: ${path}`)
    })

    const { admin, upsert } = makeAdmin()
    await provisionGhlOrgConfig(admin as any, TOKEN, ORG_ID, LOCATION_ID)

    expect(upsert).toHaveBeenCalledTimes(1)
    const [row, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'org_id' })
    expect(row.org_id).toBe(ORG_ID)
    expect(row.pipeline_id).toBe('pipe-full')
    expect(row.provisioned_by).toBe('oauth-provisioner')
    expect(Object.keys(row.stage_ids).sort()).toEqual(
      [
        'attendedSession', 'certificateIssued', 'checkedIn', 'confirmed',
        'followUpComplete', 'noShow', 'paymentPending', 'registered',
      ].sort(),
    )
    expect(Object.keys(row.field_ids).sort()).toEqual(FIELD_DEFS.map((f) => f.key).sort())
  })
})
