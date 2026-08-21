import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk', () => ({
  schemaTask: (opts: any) => opts,
}))

vi.mock('../../lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlPost: vi.fn(),
  ghlPut: vi.fn(),
  ghlAddContactTags: vi.fn(),
}))

vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
}))

vi.mock('@/lib/integrations/ghl/location', () => ({
  ghlOrgIdForLocation: vi.fn(),
}))

// Partial mock: config.ts is loaded for real (buildStageTagMaps runs at module
// load); only getGhlOrgConfig is stubbed per-case.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

import { ghlSyncTask, adoptedDuplicateOpportunityId } from '../ghl-sync'
import { createAdminClient } from '../../lib/supabase-admin'
import { ghlPost, ghlPut, ghlAddContactTags } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlOrgIdForLocation } from '@/lib/integrations/ghl/location'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  GHL_STAGE_IDS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_FIELD_KEYS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

const SAUP_ORG_ID = '22222222-2222-4222-8222-222222222201'
const SAUP_LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'
const SYNC_STATE_ID = 'sync-1'

// The opportunity id from the live cross-transport order that exposed the
// double-execution bug — run 1 created it, run 2 was handed it back on the 400.
const EXISTING_OPP_ID = 'njSnveg1cVKkQ0hVq1zO'

const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS as GhlOrgConfig['fieldIds'],
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
  calendarId: null,
}

type SyncPayload = {
  registrationId: string
  ghlLocationId: string
  ghlContactId: string
  ghlOrderId: string
  ticketTypeTitle: string
  eventId: string
  eventTitle: string
  eventSlug: string
  attendeeName: string
  amountPaidCents: number
  paymentStatus: string
  syncStateId: string
}

// schemaTask is mocked to identity, so at runtime ghlSyncTask is the raw opts
// object with a callable .run — its real type does not expose .run.
const runTask = (overrides: Partial<SyncPayload> = {}) =>
  (ghlSyncTask as unknown as { run: (p: SyncPayload) => Promise<unknown> }).run({
    registrationId:  'reg-1',
    ghlLocationId:   SAUP_LOCATION_ID,
    ghlContactId:    'contact-1',
    ghlOrderId:      'order-1',
    ticketTypeTitle: 'General Admission',
    eventId:         'event-1',
    eventTitle:      'Birmingham IEO',
    eventSlug:       'birmingham-ieo',
    attendeeName:    'Ada Lovelace',
    amountPaidCents: 5000,
    paymentStatus:   'paid',
    syncStateId:     SYNC_STATE_ID,
    ...overrides,
  })

type SyncStateRow = {
  id: string
  status: string
  ghl_opportunity_id: string | null
  pending_stage_id: string | null
  retries: number
  last_error: string | null
  dead_lettered: boolean
}

function baseRow(overrides: Partial<SyncStateRow> = {}): SyncStateRow {
  return {
    id: SYNC_STATE_ID,
    status: 'queued_for_sync',
    ghl_opportunity_id: null,
    pending_stage_id: null,
    retries: 0,
    last_error: null,
    dead_lettered: false,
    ...overrides,
  }
}

/**
 * Fake that holds one live ghl_sync_state row and actually *executes* the
 * WHERE the job sends — an UPDATE only lands if the row satisfies both the
 * `.eq('id')` and any `.neq('status')` guard. That is what makes
 * "failed never overwrites synced" a behavioural assertion rather than a
 * string match on a filter object.
 */
function makeStateFake(
  initial: SyncStateRow,
  opts: {
    throwOnPendingStageSelect?: boolean
    foreignOwnerOf?: string
    guardSelectError?: string
    probeError?: string
  } = {},
) {
  const row = { ...initial }

  const resolver = (call: Recorded) => {
    if (call.table !== 'ghl_sync_state') throw new Error(`unexpected table in test: ${call.table}`)

    if (call.mode === 'select') {
      // The ownership probe on the adopt path: scoped to *other* rows, which
      // this one-row world only has when a test injects one.
      if (call.filters.ghl_opportunity_id) {
        if (opts.probeError) return { data: null, error: { message: opts.probeError } }
        const probed = call.filters.ghl_opportunity_id.eq
        const isForeign = opts.foreignOwnerOf !== undefined && opts.foreignOwnerOf === probed
        return { data: isForeign ? { id: 'other-sync-row' } : null, error: null }
      }
      if (opts.guardSelectError && call.columns?.includes('ghl_opportunity_id')) {
        return { data: null, error: { message: opts.guardSelectError } }
      }
      if (opts.throwOnPendingStageSelect && call.columns?.includes('pending_stage_id')) {
        throw new Error('supabase select blew up after the synced write')
      }
      return { data: { ...row }, error: null }
    }

    if (call.mode === 'update') {
      const idMatches = call.filters.id?.eq === row.id
      const excluded = call.filters.status?.neq
      const guardPasses = excluded === undefined || row.status !== excluded
      if (idMatches && guardPasses) Object.assign(row, call.payload)
      return { data: null, error: null }
    }

    throw new Error(`unexpected mode in test: ${call.mode}`)
  }

  const { admin, calls } = makeFakeAdmin(resolver)
  vi.mocked(createAdminClient).mockReturnValue(admin as any)
  return { row, calls }
}

function duplicateError(existingId: string | null = EXISTING_OPP_ID) {
  const meta = existingId
    ? `{"code":"OPPORTUNITY_NO_DUPLICATE","existingId":"${existingId}"}`
    : '{"code":"OPPORTUNITY_NO_DUPLICATE"}'
  return new Error(
    'GHL POST /opportunities/ failed: 400 — ' +
      `{"statusCode":400,"message":"Opportunity with same contact already exists in this pipeline","meta":${meta}}`,
  )
}

beforeEach(() => {
  vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue('test-token')
  vi.mocked(ghlPost).mockReset().mockResolvedValue({ opportunity: { id: 'opp-new' } } as any)
  vi.mocked(ghlPut).mockReset().mockResolvedValue({} as any)
  vi.mocked(ghlAddContactTags).mockReset().mockResolvedValue([])
  vi.mocked(ghlOrgIdForLocation).mockReset().mockResolvedValue(SAUP_ORG_ID)
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
})

describe('ghlSyncTask — guard: an opportunity id already on the row', () => {
  it('skips the opportunity POST entirely', async () => {
    makeStateFake(baseRow({ ghl_opportunity_id: EXISTING_OPP_ID }))

    await runTask()

    expect(ghlPost).not.toHaveBeenCalled()
  })

  it('reuses the existing id for the synced write and the parked-stage self-heal', async () => {
    const { row } = makeStateFake(
      baseRow({ ghl_opportunity_id: EXISTING_OPP_ID, pending_stage_id: GHL_STAGE_IDS.checkedIn }),
    )

    await runTask()

    expect(row.status).toBe('synced')
    expect(row.ghl_opportunity_id).toBe(EXISTING_OPP_ID)
    expect(ghlPut).toHaveBeenCalledWith(
      'test-token',
      `/opportunities/${EXISTING_OPP_ID}`,
      { pipelineStageId: GHL_STAGE_IDS.checkedIn },
    )
  })

  it('still POSTs when the row carries no opportunity id yet', async () => {
    const { row } = makeStateFake(baseRow())

    await runTask()

    expect(ghlPost).toHaveBeenCalledTimes(1)
    expect(row.ghl_opportunity_id).toBe('opp-new')
    expect(row.status).toBe('synced')
  })
})

describe('ghlSyncTask — the guard does not fail open', () => {
  it('a failed read of the sync row aborts the run instead of POSTing', async () => {
    makeStateFake(baseRow(), { guardSelectError: 'connection reset' })

    await expect(runTask()).rejects.toThrow('connection reset')

    expect(ghlPost).not.toHaveBeenCalled()
  })
})

describe('ghlSyncTask — adopting OPPORTUNITY_NO_DUPLICATE', () => {
  it('adopts meta.existingId and completes the run as synced', async () => {
    vi.mocked(ghlPost).mockRejectedValueOnce(duplicateError())
    const { row } = makeStateFake(baseRow())

    await expect(runTask()).resolves.not.toThrow()

    expect(row.status).toBe('synced')
    expect(row.ghl_opportunity_id).toBe(EXISTING_OPP_ID)
    expect(row.last_error).toBeNull()
  })

  it('applies the parked stage against the adopted id', async () => {
    vi.mocked(ghlPost).mockRejectedValueOnce(duplicateError())
    makeStateFake(baseRow({ pending_stage_id: GHL_STAGE_IDS.checkedIn }))

    await runTask()

    expect(ghlPut).toHaveBeenCalledWith(
      'test-token',
      `/opportunities/${EXISTING_OPP_ID}`,
      { pipelineStageId: GHL_STAGE_IDS.checkedIn },
    )
  })

  it('refuses to adopt an opportunity another sync row already owns', async () => {
    // A repeat attendee's still-open opportunity from a previous event earns
    // the same 400 — adopting it would point two registrations at one record.
    vi.mocked(ghlPost).mockRejectedValueOnce(duplicateError())
    const { row } = makeStateFake(baseRow(), { foreignOwnerOf: EXISTING_OPP_ID })

    await expect(runTask()).rejects.toThrow('OPPORTUNITY_NO_DUPLICATE')

    expect(row.status).toBe('failed')
    expect(row.ghl_opportunity_id).toBeNull()
  })

  it('refuses to adopt when the ownership probe itself errors', async () => {
    vi.mocked(ghlPost).mockRejectedValueOnce(duplicateError())
    const { row } = makeStateFake(baseRow(), { probeError: 'probe timed out' })

    await expect(runTask()).rejects.toThrow('OPPORTUNITY_NO_DUPLICATE')

    expect(row.status).toBe('failed')
    expect(row.ghl_opportunity_id).toBeNull()
    // The GHL diagnostic survives — a DB error must not displace it.
    expect(row.last_error).toContain('OPPORTUNITY_NO_DUPLICATE')
  })

  it('rethrows and stamps failed when the duplicate error carries no existingId', async () => {
    vi.mocked(ghlPost).mockRejectedValueOnce(duplicateError(null))
    const { row } = makeStateFake(baseRow())

    await expect(runTask()).rejects.toThrow('OPPORTUNITY_NO_DUPLICATE')

    expect(row.status).toBe('failed')
  })

  it('rethrows any other GHL error and stamps failed', async () => {
    vi.mocked(ghlPost).mockRejectedValueOnce(
      new Error('GHL POST /opportunities/ failed: 401 — {"message":"Invalid JWT"}'),
    )
    const { row } = makeStateFake(baseRow())

    await expect(runTask()).rejects.toThrow('Invalid JWT')

    expect(row.status).toBe('failed')
    expect(row.retries).toBe(1)
    expect(row.last_error).toContain('Invalid JWT')
  })
})

describe('adoptedDuplicateOpportunityId', () => {
  it('returns the id from a well-formed duplicate body', () => {
    expect(adoptedDuplicateOpportunityId(duplicateError())).toBe(EXISTING_OPP_ID)
  })

  it('falls back to a literal scan when the body is not parseable JSON', () => {
    const err = new Error(
      'GHL POST /opportunities/ failed: 400 — {"meta":{"code":"OPPORTUNITY_NO_DUPLICATE","existingId":"opp-trunc"',
    )
    expect(adoptedDuplicateOpportunityId(err)).toBe('opp-trunc')
  })

  it('returns null for a non-400 carrying the same code', () => {
    const err = new Error(
      'GHL POST /opportunities/ failed: 500 — {"meta":{"code":"OPPORTUNITY_NO_DUPLICATE","existingId":"opp-x"}}',
    )
    expect(adoptedDuplicateOpportunityId(err)).toBeNull()
  })

  it('returns null for a 400 that is a different error', () => {
    const err = new Error('GHL POST /opportunities/ failed: 400 — {"message":"pipelineId is required"}')
    expect(adoptedDuplicateOpportunityId(err)).toBeNull()
  })

  it('returns null for a non-Error throw', () => {
    expect(adoptedDuplicateOpportunityId('boom')).toBeNull()
  })

  it('returns null when no status can be read out of the message at all', () => {
    // A wrapper that merely quotes an earlier body must not become adoptable.
    const err = new Error('upstream said: {"meta":{"code":"OPPORTUNITY_NO_DUPLICATE","existingId":"opp-x"}}')
    expect(adoptedDuplicateOpportunityId(err)).toBeNull()
  })
})

describe('ghlSyncTask — never stamps failed over synced', () => {
  it('a throw after the synced write leaves the row synced', async () => {
    const { row } = makeStateFake(
      baseRow({ ghl_opportunity_id: EXISTING_OPP_ID }),
      { throwOnPendingStageSelect: true },
    )

    await expect(runTask()).rejects.toThrow('blew up after the synced write')

    expect(row.status).toBe('synced')
    expect(row.ghl_opportunity_id).toBe(EXISTING_OPP_ID)
    expect(row.last_error).toBeNull()
    expect(row.dead_lettered).toBe(false)
  })

  it('sends the synced exclusion in the WHERE of the failing UPDATE, not as a read-then-write', async () => {
    const { calls } = makeStateFake(
      baseRow({ ghl_opportunity_id: EXISTING_OPP_ID }),
      { throwOnPendingStageSelect: true },
    )

    await expect(runTask()).rejects.toThrow()

    const failingUpdate = calls.find(c => c.mode === 'update' && c.payload?.status === 'failed')
    expect(failingUpdate).toBeDefined()
    expect(failingUpdate!.filters.id.eq).toBe(SYNC_STATE_ID)
    expect(failingUpdate!.filters.status.neq).toBe('synced')
  })

  it('a run that fails before ever reaching synced is still stamped failed', async () => {
    vi.mocked(ghlPost).mockRejectedValueOnce(new Error('GHL POST /opportunities/ failed: 503 — upstream down'))
    const { row } = makeStateFake(baseRow({ retries: 2 }))

    await expect(runTask()).rejects.toThrow('upstream down')

    expect(row.status).toBe('failed')
    expect(row.retries).toBe(3)
    expect(row.dead_lettered).toBe(true)
  })
})
