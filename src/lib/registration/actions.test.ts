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

import { startRegistration } from './actions'
import { createRegistrationFromExternalPayment } from './external-payment'
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
      { single: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "registrations_external_order_id_key"' } } },
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

// ── createRegistrationFromExternalPayment: the GHL Events lane (R65 / batch 1) ──
//
// One GHL Events order can carry several attendees. external_order_id is UNIQUE,
// so deduping that order on the order id matches the FIRST attendee's row and hands
// attendee two attendee one's registration back as success:true — a silent, paid,
// wrong-person booking. These tests exist to keep that from coming back.

describe('createRegistrationFromExternalPayment — ghl_attendee_id lane', () => {
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

  const SHARED_ORDER = 'ghl-order-shared-1'

  function eventsParams(over: Record<string, unknown> = {}) {
    return {
      eventId: EVENT_ID,
      ticketTypeId: TICKET_ID,
      attendeeEmail: 'seat-one@test.com',
      attendeeName: 'Seat One',
      attendeePhone: null,
      amountPaidCents: 19900,
      currency: 'USD',
      externalSource: 'ghl_events',
      externalOrderId: SHARED_ORDER,
      paymentGateway: 'ghl_events',
      ghlAttendeeId: 'attendee-1',
      ghlOrderId: SHARED_ORDER,
      ...over,
    }
  }

  beforeEach(() => { adminFrom.mockClear() })

  it('dedupes on ghl_attendee_id, not external_order_id', async () => {
    const calls = sequence([
      { maybeSingle: { data: { id: 'reg-existing', qr_code: 'qr-1', app_access_token: 'tok-1' }, error: null } },
    ])

    const result = await createRegistrationFromExternalPayment(eventsParams())

    expect(result).toEqual({ success: true, registrationId: 'reg-existing', qrCode: 'qr-1', appAccessToken: 'tok-1' })
    expect(calls[0].eq).toHaveBeenCalledWith('ghl_attendee_id', 'attendee-1')
    expect(calls[0].eq).not.toHaveBeenCalledWith('external_order_id', SHARED_ORDER)
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  it('writes ghl_attendee_id and ghl_order_id and leaves external_order_id null', async () => {
    const calls = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'reg-1', qr_code: 'qr-1', app_access_token: 'tok-1' }, error: null } },
    ])

    await createRegistrationFromExternalPayment(eventsParams())

    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({
      ghl_attendee_id: 'attendee-1',
      ghl_order_id: SHARED_ORDER,
      // The UNIQUE column must stay empty or seat two is rejected outright.
      external_order_id: null,
    })
  })

  // THE DEFECT THIS BATCH EXISTS TO PREVENT.
  it('creates a SEPARATE registration for a second attendee on the same order', async () => {
    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'reg-seat-one', qr_code: 'qr-1', app_access_token: 'tok-1' }, error: null } },
    ])
    const first = await createRegistrationFromExternalPayment(eventsParams())

    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'reg-seat-two', qr_code: 'qr-2', app_access_token: 'tok-2' }, error: null } },
    ])
    const second = await createRegistrationFromExternalPayment(eventsParams({
      ghlAttendeeId: 'attendee-2',
      attendeeEmail: 'seat-two@test.com',
      attendeeName: 'Seat Two',
    }))

    expect(first).toMatchObject({ success: true, registrationId: 'reg-seat-one' })
    expect(second).toMatchObject({ success: true, registrationId: 'reg-seat-two' })
    // Order-id deduping would have made these the same row.
    expect((second as any).registrationId).not.toBe((first as any).registrationId)
  })

  // Same order, same email. Never tested before this batch: a buyer registering
  // two people can reuse their own address, and the event/email unique key stops
  // the second insert. It must fail under its own name, NOT resolve to seat one.
  it('returns duplicate_attendee_email_on_event for a second seat sharing an email', async () => {
    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'reg-seat-one', qr_code: 'qr-1', app_access_token: 'tok-1' }, error: null } },
    ])
    const first = await createRegistrationFromExternalPayment(eventsParams())
    expect(first).toMatchObject({ success: true, registrationId: 'reg-seat-one' })

    const calls = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "registrations_event_email_unique"',
        details: 'Key (event_id, lower(attendee_email))=(evt, seat-one@test.com) already exists.',
      } } },
    ])
    const second = await createRegistrationFromExternalPayment(eventsParams({
      ghlAttendeeId: 'attendee-2',
      attendeeName: 'Seat Two',
    }))

    expect(second).toEqual({ success: false, error: 'duplicate_attendee_email_on_event' })
    // The specific danger: handing back seat one's registration as a success.
    expect(second).not.toMatchObject({ registrationId: 'reg-seat-one' })
    expect((second as any).registrationId).toBeUndefined()
    // And it must not go looking for a row to return, either.
    expect(calls.length).toBe(2)
  })

  it('also names the composite event/email/ticket key rather than re-reading', async () => {
    const calls = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "registrations_no_duplicate_idx"',
      } } },
    ])

    const result = await createRegistrationFromExternalPayment(eventsParams({ ghlAttendeeId: 'attendee-2' }))

    expect(result).toEqual({ success: false, error: 'duplicate_attendee_email_on_event' })
    expect(calls.length).toBe(2)
  })

  it('resolves a 23505 on the attendee key itself to the winning row', async () => {
    const calls = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "registrations_ghl_attendee_id_key"',
      } } },
      { maybeSingle: { data: { id: 'reg-winner', qr_code: 'qr-w', app_access_token: 'tok-w' }, error: null } },
    ])

    const result = await createRegistrationFromExternalPayment(eventsParams())

    expect(result).toEqual({ success: true, registrationId: 'reg-winner', qrCode: 'qr-w', appAccessToken: 'tok-w' })
    expect(calls[2].eq).toHaveBeenCalledWith('ghl_attendee_id', 'attendee-1')
  })

  // On the Events lane the order-id key is NOT this call's dedupe key, so a
  // violation of it is not a row this call may claim.
  it('does not claim a row when a non-dedupe constraint fires', async () => {
    sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "registrations_external_order_id_key"',
      } } },
    ])

    const result = await createRegistrationFromExternalPayment(eventsParams())

    expect(result).toMatchObject({ success: false })
    expect((result as any).registrationId).toBeUndefined()
  })

  // The pre-existing lane must be untouched by all of the above.
  it('leaves the external_order_id path behaving exactly as before when ghlAttendeeId is absent', async () => {
    const calls = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'reg-legacy', qr_code: 'qr-l', app_access_token: 'tok-l' }, error: null } },
    ])

    const { ghlAttendeeId: _a, ghlOrderId: _o, ...legacy } = eventsParams()
    const result = await createRegistrationFromExternalPayment(legacy as any)

    expect(result).toEqual({ success: true, registrationId: 'reg-legacy', qrCode: 'qr-l', appAccessToken: 'tok-l' })
    expect(calls[0].eq).toHaveBeenCalledWith('external_order_id', SHARED_ORDER)
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({
      external_order_id: SHARED_ORDER,
      ghl_attendee_id: null,
      ghl_order_id: null,
    })
  })
})
