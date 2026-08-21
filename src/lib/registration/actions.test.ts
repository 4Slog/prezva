// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: vi.fn().mockReturnValue('1.2.3.4') })),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))
vi.mock('@/lib/ratelimit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
  registrationLimiter: {},
}))
vi.mock('@/lib/stripe/checkout', () => ({
  createCheckoutSession: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueConfirmationEmail: vi.fn(),
}))
vi.mock('@/lib/integrations/_shared/association-verify', () => ({
  verifyMembership: vi.fn(),
}))
vi.mock('@/lib/entitlements', () => ({
  isOrgEntitled: vi.fn(),
}))

function makeChain(config: { maybeSingle?: any } = {}) {
  const chain: any = {}
  for (const k of ['select', 'eq', 'in', 'insert', 'update', 'delete']) chain[k] = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockResolvedValue(config.maybeSingle ?? { data: null, error: null })
  return chain
}

let serverFromImpl: (table: string) => any
const serverFrom = vi.fn((t: string) => serverFromImpl(t))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    from: serverFrom,
  })),
}))

let adminFromImpl: (table: string) => any
const adminFrom = vi.fn((t: string) => adminFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: adminFrom })),
}))

import { startRegistration, createRegistrationFromExternalPayment } from './actions'
import { isOrgEntitled } from '@/lib/entitlements'

const ORG_ID = 'org-1'
const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const TICKET_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

const BASE_EVENT = {
  id: EVENT_ID, title: 'Test Event', slug: 'test-event', status: 'published',
  capacity: 100, registration_count: 0, timezone: 'America/Chicago', start_at: new Date().toISOString(),
  venue_name: null, venue_city: null, venue_state: null, org_id: ORG_ID,
  require_approval: false, event_type: 'in_person', virtual_url: null,
  registration_invite_code: null, registration_domain_restrict: null,
  organizations: { name: 'Test Org', email: null, stripe_account_id: null },
}

function makeFormData() {
  const fd = new FormData()
  fd.set('event_id', EVENT_ID)
  fd.set('ticket_type_id', TICKET_ID)
  fd.set('attendee_email', 'attendee@test.com')
  fd.set('attendee_name', 'Test Attendee')
  return fd
}

beforeEach(() => {
  serverFrom.mockClear()
  adminFrom.mockClear()
  vi.mocked(isOrgEntitled).mockReset()
})

describe('startRegistration — lane-scoped entitlement gate (GE-8 hardening)', () => {
  it('GHL-linked + unentitled org: refuses registration before ever loading the ticket type', async () => {
    serverFromImpl = (table) => {
      if (table === 'events') return makeChain({ maybeSingle: { data: BASE_EVENT, error: null } })
      return makeChain()
    }
    adminFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-1' }, error: null } })
      return makeChain()
    }
    vi.mocked(isOrgEntitled).mockResolvedValue(false)

    const result = await startRegistration(makeFormData())

    expect(result).toEqual({ error: 'Registration is closed for this event.' })
    expect(isOrgEntitled).toHaveBeenCalledWith(ORG_ID)
    // Never reached the ticket lookup — the gate short-circuited first.
    expect(serverFrom).not.toHaveBeenCalledWith('ticket_types')
  })

  it('GHL-linked + entitled org: passes the gate and proceeds to the ticket lookup', async () => {
    serverFromImpl = (table) => {
      if (table === 'events') return makeChain({ maybeSingle: { data: BASE_EVENT, error: null } })
      if (table === 'ticket_types') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    }
    adminFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-1' }, error: null } })
      return makeChain()
    }
    vi.mocked(isOrgEntitled).mockResolvedValue(true)

    const result = await startRegistration(makeFormData())

    // Proved it passed the gate: it reached the (unmocked) ticket lookup and
    // got the "not found" outcome, rather than the gate's refusal.
    expect(result).toEqual({ error: 'Ticket type not found or unavailable' })
    expect(isOrgEntitled).toHaveBeenCalledWith(ORG_ID)
  })

  it('LANE GUARD: standalone org (no ghl_location_links row) is completely untouched — isOrgEntitled is never called', async () => {
    serverFromImpl = (table) => {
      if (table === 'events') return makeChain({ maybeSingle: { data: BASE_EVENT, error: null } })
      if (table === 'ticket_types') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    }
    adminFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    }
    // Even if isOrgEntitled were called and returned false, this org must
    // still register successfully — standalone orgs default to plan='free'
    // and a blanket check would close registration platform-wide.
    vi.mocked(isOrgEntitled).mockResolvedValue(false)

    const result = await startRegistration(makeFormData())

    expect(result).toEqual({ error: 'Ticket type not found or unavailable' })
    expect(isOrgEntitled).not.toHaveBeenCalled()
  })
})

// ── createRegistrationFromExternalPayment: idempotency (R55 Batch 2) ──────────

describe('createRegistrationFromExternalPayment — external_order_id idempotency', () => {
  // Sequential chain over the registrations table: the function does a read,
  // then an insert, then (on a unique violation) a second read.
  function sequence(steps: Array<{ maybeSingle?: any; single?: any }>) {
    let i = 0
    const calls: any[] = []
    adminFromImpl = () => {
      const step = steps[i++] ?? {}
      const chain: any = {}
      for (const k of ['select', 'eq', 'in', 'insert', 'update', 'delete']) chain[k] = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockResolvedValue(step.maybeSingle ?? { data: null, error: null })
      chain.single = vi.fn().mockResolvedValue(step.single ?? { data: null, error: null })
      calls.push(chain)
      return chain
    }
    return calls
  }

  const PARAMS = {
    eventId: EVENT_ID,
    ticketTypeId: TICKET_ID,
    attendeeEmail: 'a@test.com',
    attendeeName: 'A Tester',
    attendeePhone: null,
    amountPaidCents: 22500,
    currency: 'USD',
    externalSource: 'ghl_payment',
    externalOrderId: 'order-abc',
    paymentGateway: 'stripe',
  }

  beforeEach(() => {
    adminFrom.mockClear()
  })

  it('returns the existing registration on the read fast path without inserting', async () => {
    const calls = sequence([
      { maybeSingle: { data: { id: 'reg-existing', qr_code: 'qr-1', app_access_token: 'tok-1' }, error: null } },
    ])

    const result = await createRegistrationFromExternalPayment(PARAMS)

    expect(result).toEqual({ success: true, registrationId: 'reg-existing', qrCode: 'qr-1', appAccessToken: 'tok-1' })
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  // The read above is a fast path, not a lock. Two concurrent deliveries — which
  // is now the normal case, with 12 GHL retries and two transports live — can
  // both miss it and both insert. The UNIQUE constraint is the real guard, and a
  // duplicate must resolve to the winning row, not to a 500 that GHL retries.
  it('resolves a 23505 unique violation to the winning row instead of failing', async () => {
    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } } },
      { maybeSingle: { data: { id: 'reg-winner', qr_code: 'qr-w', app_access_token: 'tok-w' }, error: null } },
    ])

    const result = await createRegistrationFromExternalPayment(PARAMS)

    expect(result).toEqual({ success: true, registrationId: 'reg-winner', qrCode: 'qr-w', appAccessToken: 'tok-w' })
  })

  it('reports honestly when a 23505 fires but no matching row can be found', async () => {
    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: '23505', message: 'some other unique constraint' } } },
      { maybeSingle: { data: null, error: null } },
    ])

    const result = await createRegistrationFromExternalPayment(PARAMS)

    // Never invents a success it cannot substantiate.
    expect(result).toEqual({ success: false, error: 'some other unique constraint' })
  })

  it('still reports capacity rejection as waitlisted, not as a duplicate', async () => {
    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: 'P0001', message: 'Event is at capacity' } } },
    ])

    const result = await createRegistrationFromExternalPayment(PARAMS)

    expect(result).toEqual({ success: false, error: 'Event is at capacity', waitlisted: true })
  })
})
