import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk', () => ({
  schemaTask: (opts: any) => opts,
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

vi.mock('@/lib/integrations/ghl/location', () => ({
  ghlOrgIdForLocation: vi.fn(),
}))

// Partial mock: keep the real buildStageTagMaps (config.ts calls it at module
// load to build GHL_STAGE_TAGS/GHL_STAGE_SUPERSEDES_TAGS) and only stub
// getGhlOrgConfig, which this test controls per-case.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

import { ghlStageMoveTask } from '../ghl-stage-move'
import { createAdminClient } from '../../lib/supabase-admin'
import { ghlPut, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
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

// Built from the legacy constants (which are themselves derived via
// buildStageTagMaps) so this fixture can't drift from production values.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS,
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
}

// schemaTask is mocked to identity above, so at runtime ghlStageMoveTask is the
// raw opts object with a callable .run — but its real (unmocked) type is
// TaskWithSchema, which doesn't expose .run for direct invocation. Cast through
// this narrow shape rather than `as any` at every call site.
const runTask = (payload: { registrationId: string; stageId: string }) =>
  (ghlStageMoveTask as unknown as { run: (p: typeof payload) => Promise<unknown> }).run(payload)

const REGISTRATION_ID = 'reg-1'
const CONTACT_ID = 'contact-1'
const NO_SHOW_TAG = 'prezva-no-show'

type SyncStateRow = {
  id: string
  status: string
  ghl_opportunity_id: string | null
  ghl_contact_id: string | null
  location_id: string | null
}

function baseSyncState(overrides: Partial<SyncStateRow> = {}): SyncStateRow {
  return {
    id: 'sync-1',
    status: 'synced',
    ghl_opportunity_id: 'opp-1',
    ghl_contact_id: CONTACT_ID,
    location_id: SAUP_LOCATION_ID,
    ...overrides,
  }
}

function buildResolver(syncState: SyncStateRow | null) {
  return (call: Recorded) => {
    if (call.table === 'ghl_sync_state') {
      if (call.mode === 'select') return { data: syncState, error: null }
      if (call.mode === 'update') return { data: null, error: null }
    }
    throw new Error(`unexpected table in test: ${call.table}`)
  }
}

beforeEach(() => {
  vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue('test-token')
  vi.mocked(ghlPut).mockReset().mockResolvedValue({} as any)
  vi.mocked(ghlAddContactTags).mockReset().mockResolvedValue([])
  vi.mocked(ghlRemoveContactTags).mockReset().mockResolvedValue([])
  vi.mocked(ghlOrgIdForLocation).mockReset().mockResolvedValue(SAUP_ORG_ID)
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
})

describe('ghlStageMoveTask — superseded tag removal', () => {
  it('entering attendedSession calls ghlRemoveContactTags with [prezva-no-show]', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.attendedSession })

    expect(ghlRemoveContactTags).toHaveBeenCalledWith('test-token', CONTACT_ID, [NO_SHOW_TAG])
  })

  it('entering checkedIn calls ghlRemoveContactTags with [prezva-no-show]', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.checkedIn })

    expect(ghlRemoveContactTags).toHaveBeenCalledWith('test-token', CONTACT_ID, [NO_SHOW_TAG])
  })

  it('entering certificateIssued calls ghlRemoveContactTags with [prezva-no-show, prezva-ce-incomplete]', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.certificateIssued })

    expect(ghlRemoveContactTags).toHaveBeenCalledWith('test-token', CONTACT_ID, [NO_SHOW_TAG, 'prezva-ce-incomplete'])
  })

  it('entering confirmed does not call ghlRemoveContactTags', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.confirmed })

    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
  })

  it('entering noShow does not call ghlRemoveContactTags', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.noShow })

    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
  })

  it('a throwing ghlRemoveContactTags does not fail the task', async () => {
    vi.mocked(ghlRemoveContactTags).mockRejectedValueOnce(new Error('GHL boom'))
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    const result = await runTask({
      registrationId: REGISTRATION_ID,
      stageId: GHL_STAGE_IDS.attendedSession,
    })

    expect(result).toEqual({ applied: true, opportunityId: 'opp-1' })
  })

  it('no contact id means no removal attempted', async () => {
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState({ ghl_contact_id: null })))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.attendedSession })

    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
  })
})

describe('ghlStageMoveTask — missing ghl_org_config (Amendment 2, case b)', () => {
  it('still applies the stage PUT but skips tag apply/removal and logs console.error', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getGhlOrgConfig).mockResolvedValueOnce(null)
    const { admin } = makeFakeAdmin(buildResolver(baseSyncState()))
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    const result = await runTask({ registrationId: REGISTRATION_ID, stageId: GHL_STAGE_IDS.attendedSession })

    expect(result).toEqual({ applied: true, opportunityId: 'opp-1' })
    expect(ghlAddContactTags).not.toHaveBeenCalled()
    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
    expect(consoleErr).toHaveBeenCalledWith(expect.stringContaining('has no ghl_org_config row'))
    consoleErr.mockRestore()
  })
})
