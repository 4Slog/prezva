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
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn().mockResolvedValue('test-token') },
}))
vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlGet: vi.fn(),
}))
vi.mock('@/lib/embedded/org-helpers', () => ({
  resolveOrgOwnerProfileId: vi.fn(),
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

import { embedPublishEvent, createTicketTypeFromEmbedProduct, acknowledgeSyncIssue, createEventFromEmbed } from './event-actions'
import { requireEntitlement } from '@/lib/entitlements'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { ghlGet } from '@/lib/integrations/ghl/client'
import { resolveOrgOwnerProfileId } from '@/lib/embedded/org-helpers'

const ORG_ID = 'org-1'
const EVENT_ID = 'event-1'

beforeEach(() => {
  mockFrom.mockClear()
  vi.mocked(requireEntitlement).mockReset()
  vi.mocked(ghlAdapter.getAccessToken).mockClear()
  vi.mocked(ghlGet).mockReset()
})

function withOrgLink() {
  return (table: string) => {
    if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
    return makeChain()
  }
}

// ghl_location_links gets queried twice in acknowledgeSyncIssue's path — once by
// resolveEmbedContext for the caller's own session location, once for the target
// row's location — each needing a different org_id, so this branches on the
// actual .eq() filter value instead of returning one fixed result.
function makeLocationLinksChain(linksByLocation: Record<string, string>) {
  const chain: any = {}
  let filterValue: string | undefined
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn((_col: string, val: string) => { filterValue = val; return chain })
  chain.maybeSingle = vi.fn(async () => {
    const orgId = filterValue !== undefined ? linksByLocation[filterValue] : undefined
    return { data: orgId ? { org_id: orgId } : null, error: null }
  })
  return chain
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
    expect(ghlAdapter.getAccessToken).not.toHaveBeenCalled()
    expect(ghlGet).not.toHaveBeenCalled()
  })
})

describe('createTicketTypeFromEmbedProduct — location-wide mapping guard (R44)', () => {
  const PRODUCT_ID = 'prod-1'
  const PRICE_ID = 'price-1'

  // Tracks .eq() filters accumulated since the last .select() so a single
  // reusable chain can answer different .from('events') queries by row id,
  // mirroring makeLocationLinksChain's "branch on the filter value" pattern
  // above but for the two-eq ownership-check query plus the single-eq
  // other-event-title lookup this guard also issues.
  function makeEventsLookupChain(byId: Record<string, Record<string, unknown> | null>) {
    const chain: any = {}
    let filters: Record<string, string> = {}
    chain.select = vi.fn(() => { filters = {}; return chain })
    chain.eq = vi.fn((col: string, val: string) => { filters[col] = val; return chain })
    chain.maybeSingle = vi.fn(async () => ({ data: filters.id ? (byId[filters.id] ?? null) : null, error: null }))
    return chain
  }

  function makeInsertableChain(singleResult: { data: any; error: any }) {
    const chain: any = {}
    for (const k of ['select', 'eq', 'insert', 'delete']) chain[k] = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.single = vi.fn().mockResolvedValue(singleResult)
    return chain
  }

  beforeEach(() => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    vi.mocked(ghlGet).mockImplementation(async (_token: unknown, path: unknown) => {
      const p = path as string
      if (p.startsWith(`/products/${PRODUCT_ID}?`)) {
        return { _id: PRODUCT_ID, name: 'GA Product', productType: 'one_time', status: 'active', locationId: 'loc-1' }
      }
      if (p.includes('/price?')) {
        return { prices: [{ _id: PRICE_ID, product: PRODUCT_ID, name: 'Early Bird', type: 'one_time', currency: 'USD', amount: 50, trackInventory: false }] }
      }
      throw new Error(`unexpected ghlGet path ${p}`)
    })
  })

  it('same-event re-link returns the existing mapping without inserting or calling GHL', async () => {
    const mappingsChain = makeChain({
      maybeSingle: {
        data: { id: 'map-1', ticket_type_id: 'tt-existing', event_id: EVENT_ID, ghl_price_name: 'Early Bird', ghl_product_name: 'GA Product' },
        error: null,
      },
    })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return makeChain({ maybeSingle: { data: { id: EVENT_ID, org_id: ORG_ID }, error: null } })
      if (table === 'ticket_type_product_mappings') return mappingsChain
      return makeChain()
    }

    const result = await createTicketTypeFromEmbedProduct(EVENT_ID, PRODUCT_ID, PRICE_ID)

    expect(result).toEqual({ ticketTypeId: 'tt-existing', mappingId: 'map-1' })
    expect(ghlAdapter.getAccessToken).not.toHaveBeenCalled()
    expect(ghlGet).not.toHaveBeenCalled()
  })

  it('cross-event link is refused and the message names the other event', async () => {
    const mappingsChain = makeChain({
      maybeSingle: {
        data: { id: 'map-1', ticket_type_id: 'tt-other', event_id: 'other-event', ghl_price_name: 'Early Bird', ghl_product_name: 'GA Product' },
        error: null,
      },
    })
    const eventsChain = makeEventsLookupChain({
      [EVENT_ID]: { id: EVENT_ID, org_id: ORG_ID },
      'other-event': { title: 'SAUP Winter Planning Workshop 2026' },
    })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      if (table === 'ticket_type_product_mappings') return mappingsChain
      return makeChain()
    }

    const result = await createTicketTypeFromEmbedProduct(EVENT_ID, PRODUCT_ID, PRICE_ID)

    expect(result).toEqual({
      error: 'Early Bird is already linked to SAUP Winter Planning Workshop 2026. Each event needs its own price — GHL tracks inventory per price, so two events sharing one price would share one seat count.',
    })
    expect(ghlAdapter.getAccessToken).not.toHaveBeenCalled()
    expect(ghlGet).not.toHaveBeenCalled()
  })

  it('creates a ticket type named from the price, not the product', async () => {
    const ticketTypesChain = makeInsertableChain({ data: { id: 'tt-new' }, error: null })
    const mappingsChain = makeInsertableChain({ data: { id: 'map-new' }, error: null })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return makeChain({ maybeSingle: { data: { id: EVENT_ID, org_id: ORG_ID }, error: null } })
      if (table === 'ticket_type_product_mappings') return mappingsChain
      if (table === 'ticket_types') return ticketTypesChain
      return makeChain()
    }

    const result = await createTicketTypeFromEmbedProduct(EVENT_ID, PRODUCT_ID, PRICE_ID)

    expect('error' in result).toBe(false)
    expect(ticketTypesChain.insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Early Bird' }))
  })

  it('falls back to the product name when the price has no name', async () => {
    vi.mocked(ghlGet).mockImplementation(async (_token: unknown, path: unknown) => {
      const p = path as string
      if (p.startsWith(`/products/${PRODUCT_ID}?`)) {
        return { _id: PRODUCT_ID, name: 'GA Product', productType: 'one_time', status: 'active', locationId: 'loc-1' }
      }
      if (p.includes('/price?')) {
        return { prices: [{ _id: PRICE_ID, product: PRODUCT_ID, name: '', type: 'one_time', currency: 'USD', amount: 50, trackInventory: false }] }
      }
      throw new Error(`unexpected ghlGet path ${p}`)
    })
    const ticketTypesChain = makeInsertableChain({ data: { id: 'tt-new' }, error: null })
    const mappingsChain = makeInsertableChain({ data: { id: 'map-new' }, error: null })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return makeChain({ maybeSingle: { data: { id: EVENT_ID, org_id: ORG_ID }, error: null } })
      if (table === 'ticket_type_product_mappings') return mappingsChain
      if (table === 'ticket_types') return ticketTypesChain
      return makeChain()
    }

    const result = await createTicketTypeFromEmbedProduct(EVENT_ID, PRODUCT_ID, PRICE_ID)

    expect('error' in result).toBe(false)
    expect(ticketTypesChain.insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'GA Product' }))
  })
})

describe('acknowledgeSyncIssue', () => {
  const ROW_ID = 'sync-row-1'

  it('acknowledges a row whose location resolves to the caller org', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    const syncStateChain = makeChain({
      maybeSingle: { data: { id: ROW_ID, location_id: 'loc-1' }, error: null },
      awaited: { data: null, error: null },
    })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeLocationLinksChain({ 'loc-1': ORG_ID })
      if (table === 'ghl_sync_state') return syncStateChain
      return makeChain()
    }

    const result = await acknowledgeSyncIssue(ROW_ID)

    expect(result).toEqual({ ok: true })
    expect(syncStateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledged_at: expect.any(String) }),
    )
  })

  it('rejects a row whose location resolves to a different org, without writing', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue(null)
    const syncStateChain = makeChain({
      maybeSingle: { data: { id: ROW_ID, location_id: 'other-loc' }, error: null },
    })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeLocationLinksChain({ 'loc-1': ORG_ID, 'other-loc': 'other-org' })
      if (table === 'ghl_sync_state') return syncStateChain
      return makeChain()
    }

    const result = await acknowledgeSyncIssue(ROW_ID)

    expect(result).toEqual({ error: 'Sync issue not found' })
    expect(syncStateChain.update).not.toHaveBeenCalled()
  })

  it('returns entitlement_required without looking up the row when the org is not entitled', async () => {
    vi.mocked(requireEntitlement).mockResolvedValue({ error: 'entitlement_required' })
    const syncStateChain = makeChain()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeLocationLinksChain({ 'loc-1': ORG_ID })
      if (table === 'ghl_sync_state') return syncStateChain
      return makeChain()
    }

    const result = await acknowledgeSyncIssue(ROW_ID)

    expect(result).toEqual({ error: 'entitlement_required' })
    expect(syncStateChain.select).not.toHaveBeenCalled()
  })
})

describe('createEventFromEmbed — timezone derivation', () => {
  function makeEventsChain(insertResult: any) {
    const chain: any = {}
    for (const k of ['select', 'eq', 'insert']) chain[k] = vi.fn().mockReturnValue(chain)
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null }) // slug always free
    chain.single = vi.fn().mockResolvedValue(insertResult)
    return chain
  }

  function formData(fields: Record<string, string>) {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  const BASE_FIELDS = {
    title: 'New Event',
    start_at: '2026-09-01T09:00:00Z',
    end_at: '2026-09-01T17:00:00Z',
  }

  beforeEach(() => {
    vi.mocked(resolveOrgOwnerProfileId).mockReset().mockResolvedValue('owner-profile-id')
  })

  it('derives timezone from the org when omitted', async () => {
    const eventsChain = makeEventsChain({ data: { id: 'evt-new', slug: 'new-event' }, error: null })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      if (table === 'organizations') return makeChain({ maybeSingle: { data: { timezone: 'America/Denver' }, error: null } })
      return makeChain()
    }

    const result = await createEventFromEmbed(formData(BASE_FIELDS))

    expect('error' in result).toBe(false)
    expect(eventsChain.insert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Denver' }))
  })

  it('honors an explicitly submitted timezone — never looks up the org', async () => {
    const eventsChain = makeEventsChain({ data: { id: 'evt-new', slug: 'new-event' }, error: null })
    let organizationsTouched = false
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      if (table === 'organizations') { organizationsTouched = true; return makeChain() }
      return makeChain()
    }

    const result = await createEventFromEmbed(formData({ ...BASE_FIELDS, timezone: 'Pacific/Honolulu' }))

    expect('error' in result).toBe(false)
    expect(eventsChain.insert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Pacific/Honolulu' }))
    expect(organizationsTouched).toBe(false)
  })

  it('errors instead of guessing when neither the form nor the org has a timezone', async () => {
    const eventsChain = makeEventsChain({ data: null, error: null })
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: ORG_ID }, error: null } })
      if (table === 'events') return eventsChain
      if (table === 'organizations') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    }

    const result = await createEventFromEmbed(formData(BASE_FIELDS))

    expect(result).toEqual({ error: 'Could not determine a timezone for this event.' })
    expect(eventsChain.insert).not.toHaveBeenCalled()
  })
})
