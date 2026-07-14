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

vi.mock('@/lib/integrations/ghl/token', () => ({
  getGhlToken: vi.fn(),
}))

import { ghlStageMoveTask } from '../ghl-stage-move'
import { createAdminClient } from '../../lib/supabase-admin'
import { ghlPut, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { GHL_STAGE_IDS } from '@/lib/integrations/ghl/config'

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
}

function baseSyncState(overrides: Partial<SyncStateRow> = {}): SyncStateRow {
  return {
    id: 'sync-1',
    status: 'synced',
    ghl_opportunity_id: 'opp-1',
    ghl_contact_id: CONTACT_ID,
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
  vi.mocked(getGhlToken).mockReset().mockReturnValue('test-token')
  vi.mocked(ghlPut).mockReset().mockResolvedValue({} as any)
  vi.mocked(ghlAddContactTags).mockReset().mockResolvedValue([])
  vi.mocked(ghlRemoveContactTags).mockReset().mockResolvedValue([])
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
