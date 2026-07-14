import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/trigger', () => ({
  enqueueGhlStageMove: vi.fn().mockResolvedValue(null),
}))

const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } } }) },
  })),
}))

const mockRpc = vi.fn()
let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))

import { POST } from '@/app/api/e/[slug]/sessions/[sessionId]/watch/route'
import { enqueueGhlStageMove } from '@/lib/trigger'
import { GHL_STAGE_IDS } from '@/lib/integrations/ghl/config'

const SESSION_ID = 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

// 1-hour session: duration = 3600s, 80% threshold = 2880s
const mockSession = {
  id: SESSION_ID, event_id: EVENT_ID, is_published: true,
  starts_at: '2026-01-01T00:00:00Z', ends_at: '2026-01-01T01:00:00Z',
}
const mockReg = { id: REG_ID }

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'eq']) base[k] = vi.fn().mockReturnThis()
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'eq']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

function setupTables() {
  mockFromImpl = (t) => {
    if (t === 'sessions') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSession, error: null }) })
    if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockReg, error: null }) })
    return makeChain()
  }
}

function makeReq(watchedSeconds: number) {
  return {
    headers: { get: (k: string) => (k === 'content-type' ? 'application/json' : null) },
    json: vi.fn().mockResolvedValue({ watchedSeconds }),
    text: vi.fn().mockResolvedValue(JSON.stringify({ watchedSeconds })),
  } as any
}

async function callPost(watchedSeconds: number) {
  return POST(makeReq(watchedSeconds), { params: Promise.resolve({ slug: 'evt', sessionId: SESSION_ID }) })
}

describe('watch route — GHL stage move on 80% crossing (door 5)', () => {
  beforeEach(() => {
    vi.mocked(enqueueGhlStageMove).mockClear()
    setupTables()
  })

  it('fires enqueueGhlStageMove exactly once when crossing the 80% threshold for the first time', async () => {
    mockRpc.mockResolvedValue({ data: [{ prior_watched: null, new_watched: 3000 }], error: null })
    const res = await callPost(3000)
    expect(res.status).toBe(200)
    expect(enqueueGhlStageMove).toHaveBeenCalledTimes(1)
    expect(enqueueGhlStageMove).toHaveBeenCalledWith({ registrationId: REG_ID, stageId: GHL_STAGE_IDS.attendedSession })
  })

  it('does not fire below the 80% threshold', async () => {
    mockRpc.mockResolvedValue({ data: [{ prior_watched: null, new_watched: 1000 }], error: null })
    const res = await callPost(1000)
    expect(res.status).toBe(200)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })

  it('does not fire again once already above the threshold', async () => {
    mockRpc.mockResolvedValue({ data: [{ prior_watched: 3000, new_watched: 3200 }], error: null })
    const res = await callPost(3200)
    expect(res.status).toBe(200)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })

  it('does not fire when the in-person guard no-ops (new_watched null)', async () => {
    mockRpc.mockResolvedValue({ data: [{ prior_watched: null, new_watched: null }], error: null })
    const res = await callPost(3000)
    expect(res.status).toBe(200)
    expect(enqueueGhlStageMove).not.toHaveBeenCalled()
  })
})
