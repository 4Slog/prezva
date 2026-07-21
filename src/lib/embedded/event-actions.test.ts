// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn().mockReturnValue({ value: 'fake-embed-token' }),
  })),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn().mockResolvedValue({ location_id: 'loc-1' }),
  COOKIE_NAME: 'embedded_session',
}))
vi.mock('@/lib/entitlements', () => ({
  requireEntitlement: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/token', () => ({
  getGhlToken: vi.fn().mockReturnValue('test-token'),
}))
vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlGet: vi.fn(),
}))

function makeChain(config: { maybeSingle?: any; awaited?: any } = {}) {
  const chain: any = {}
  for (const k of ['select', 'eq', 'in', 'insert', 'update', 'delete']) chain[k] = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockResolvedValue(config.maybeSingle ?? { data: null, error: null })
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null })
  const awaited = config.awaited ?? { data: null, error: null }
  chain.then = (resolve: any, reject: any) => Promise.resolve(awaited).then(resolve, reject)
  return chain
}

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { embedPublishEvent, createTicketTypeFromEmbedProduct } from './event-actions'
import { requireEntitlement } from '@/lib/entitlements'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { ghlGet } from '@/lib/integrations/ghl/client'

const ORG_ID = 'org-1'
const EVENT_ID = 'event-1'

beforeEach(() => {
  mockFrom.mockClear()
  vi.mocked(requireEntitlement).mockReset()
  vi.mocked(getGhlToken).mockClear()
  vi.mocked(ghlGet).mockReset()
})

function withOrgLink() {
  return (table: string) => {
    if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
    return makeChain()
  }
}

describe('embedPublishEvent', () => {
  it('publishes draft -> published when entitled', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    const eventsChain = makeChain({ maybeSingle: { data: { id: EVENT_ID, status: 'draft' }, error: null } })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      return makeChain()
    }

    const result = await embedPublishEvent(EVENT_ID)
    expect(result).toEqual({ ok: true, status: 'published' })
    expect(eventsChain.update).toHaveBeenCalledWith({ status: 'published' })
  })

  it('returns entitlement_required when the org is not entitled, without touching the event row', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue({ error: 'entitlement_required' })
    const eventsChain = makeChain({ maybeSingle: { data: { id: EVENT_ID, status: 'draft' }, error: null } })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      return makeChain()
    }

    const result = await embedPublishEvent(EVENT_ID)
    expect(result).toEqual({ error: 'entitlement_required' })
    expect(eventsChain.update).not.toHaveBeenCalled()
  })

  it('rejects a transition with no embed-lane edge (e.g. already live)', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    const eventsChain = makeChain({ maybeSingle: { data: { id: EVENT_ID, status: 'live' }, error: null } })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      return makeChain()
    }

    const result = await embedPublishEvent(EVENT_ID)
    expect(result).toEqual({ error: "Cannot publish from 'live'" })
    expect(eventsChain.update).not.toHaveBeenCalled()
  })

  it('advances published -> live when entitled', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    const eventsChain = makeChain({ maybeSingle: { data: { id: EVENT_ID, status: 'published' }, error: null } })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      return makeChain()
    }

    const result = await embedPublishEvent(EVENT_ID)
    expect(result).toEqual({ ok: true, status: 'live' })
  })

  it('returns Event not found when the event does not belong to this org', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    }

    const result = await embedPublishEvent(EVENT_ID)
    expect(result).toEqual({ error: 'Event not found' })
  })
})

describe('createTicketTypeFromEmbedProduct — entitlement gate', () => {
  it('returns entitlement_required and never calls out to GHL when the org is not entitled', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue({ error: 'entitlement_required' })
    mockFromImpl = withOrgLink()

    const result = await createTicketTypeFromEmbedProduct(EVENT_ID, 'prod-1', 'price-1')

    expect(result).toEqual({ error: 'entitlement_required' })
    expect(getGhlToken).not.toHaveBeenCalled()
    expect(ghlGet).not.toHaveBeenCalled()
  })
})
