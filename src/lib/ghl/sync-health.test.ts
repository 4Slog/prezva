// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

function makeChain(config: { awaited?: any } = {}) {
  const chain: any = {}
  for (const k of ['select', 'eq', 'in', 'is']) chain[k] = vi.fn().mockReturnValue(chain)
  const awaited = config.awaited ?? { data: null, error: null }
  chain.then = (resolve: any, reject: any) => Promise.resolve(awaited).then(resolve, reject)
  return chain
}

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { getSyncHealth, translateSyncError } from './sync-health'

const ORG_ID = 'org-1'
const LOCATION_ID = 'loc-1'

beforeEach(() => {
  mockFrom.mockClear()
})

function withLocations(locationIds: string[], syncRows: any[]) {
  return (table: string) => {
    if (table === 'ghl_location_links') {
      return makeChain({ awaited: { data: locationIds.map(id => ({ ghl_location_id: id })), error: null } })
    }
    if (table === 'ghl_sync_state') {
      return makeChain({ awaited: { data: syncRows, error: null } })
    }
    return makeChain()
  }
}

function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'row-1',
    status: 'pending',
    last_error: null,
    event_type: 'payment.completed',
    external_event_id: 'ext-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('getSyncHealth — classification', () => {
  it('is green when the org has no linked locations', async () => {
    mockFromImpl = withLocations([], [])
    const result = await getSyncHealth(ORG_ID)
    expect(result).toEqual({ state: 'green', redCount: 0, yellowCount: 0, rows: [] })
  })

  it('is green when there are no unacknowledged rows', async () => {
    mockFromImpl = withLocations([LOCATION_ID], [])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('green')
    expect(result.rows).toEqual([])
  })

  it('is red for a failed row', async () => {
    mockFromImpl = withLocations([LOCATION_ID], [row({ status: 'failed', last_error: 'ticket_not_mapped' })])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('red')
    expect(result.redCount).toBe(1)
    expect(result.rows[0].severity).toBe('red')
  })

  it('is red for a waitlisted row — paid, holds no registration (D11(3))', async () => {
    mockFromImpl = withLocations([LOCATION_ID], [row({ status: 'waitlisted', last_error: null })])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('red')
    expect(result.redCount).toBe(1)
  })

  it('is red for a pending row stuck mid-flight past 15 minutes', async () => {
    const staleUpdatedAt = new Date(Date.now() - 16 * 60 * 1000).toISOString()
    mockFromImpl = withLocations([LOCATION_ID], [row({ status: 'pending', updated_at: staleUpdatedAt })])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('red')
    expect(result.redCount).toBe(1)
  })

  it('is red for a queued_for_sync row stuck mid-flight past 15 minutes', async () => {
    const staleUpdatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    mockFromImpl = withLocations([LOCATION_ID], [row({ status: 'queued_for_sync', updated_at: staleUpdatedAt })])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('red')
    expect(result.redCount).toBe(1)
  })

  it('stays green for a pending row younger than 15 minutes, even with a stale last_error', async () => {
    const freshUpdatedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    mockFromImpl = withLocations([LOCATION_ID], [
      row({ status: 'pending', updated_at: freshUpdatedAt, last_error: 'amount_divergence: paid=100 expected=50' }),
    ])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('green')
    expect(result.rows).toEqual([])
  })

  it('is yellow for a canary last_error surviving on an otherwise-progressed (synced) row', async () => {
    mockFromImpl = withLocations([LOCATION_ID], [
      row({ status: 'synced', last_error: 'amount_divergence: paid=100 expected=50' }),
    ])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('yellow')
    expect(result.yellowCount).toBe(1)
    expect(result.rows[0].severity).toBe('yellow')
  })

  it('stays green when all rows are already acknowledged (filtered at the query layer)', async () => {
    // acknowledged rows never reach classification — the query itself excludes
    // them via .is('acknowledged_at', null), so an all-acknowledged org sees an
    // empty row set here.
    mockFromImpl = withLocations([LOCATION_ID], [])
    const result = await getSyncHealth(ORG_ID)
    expect(result).toEqual({ state: 'green', redCount: 0, yellowCount: 0, rows: [] })
  })

  it('is red overall when both red and yellow rows are present, and reports both counts', async () => {
    mockFromImpl = withLocations([LOCATION_ID], [
      row({ id: 'r1', status: 'failed', last_error: 'ticket_not_mapped' }),
      row({ id: 'r2', status: 'synced', last_error: 'amount_divergence: paid=1 expected=1' }),
    ])
    const result = await getSyncHealth(ORG_ID)
    expect(result.state).toBe('red')
    expect(result.redCount).toBe(1)
    expect(result.yellowCount).toBe(1)
    expect(result.rows.map(r => r.id)).toEqual(['r1', 'r2'])
  })
})

describe('translateSyncError', () => {
  it.each([
    ['location_not_bound', 'This payment came from a GHL location that is not connected to any Prezva organization.'],
    ['ticket_not_mapped', "This payment's product is not linked to any event ticket type. Link the product in the event's ticket settings."],
    ['tenant_mismatch', "This payment's product is linked to an event in a different organization."],
    ['entitlement_blocked', 'A payment arrived while the plan was inactive, so no registration was created.'],
  ])('translates the exact literal %s', (code, expected) => {
    expect(translateSyncError(code, 'failed')).toBe(expected)
  })

  it('translates amount_divergence by prefix, ignoring the templated suffix', () => {
    expect(translateSyncError('amount_divergence: paid=500 expected=250', 'synced')).toBe(
      'The amount paid was higher than the ticket price - this may be a multi-seat purchase, which creates only one registration.',
    )
  })

  it('translates amount_unverifiable by prefix', () => {
    expect(translateSyncError('amount_unverifiable: paid=500 expected=null', 'failed')).toBe(
      'The payment could not be checked against a ticket price.',
    )
  })

  it('translates no_ghl_access_token by prefix', () => {
    expect(translateSyncError('no_ghl_access_token: org abc-123', 'failed')).toBe(
      'The GHL connection needs attention - a contact update could not be delivered.',
    )
  })

  it('falls back to the raw text for an unmatched last_error', () => {
    expect(translateSyncError('some_unexpected_registration_error', 'failed')).toBe('some_unexpected_registration_error')
  })

  it('translates a waitlisted row with no last_error as capacity-exhausted', () => {
    expect(translateSyncError(null, 'waitlisted')).toBe(
      'A payment was received but the ticket was at capacity - the buyer holds no registration.',
    )
  })
})
