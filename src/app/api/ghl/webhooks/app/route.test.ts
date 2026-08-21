// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { generateKeyPairSync, sign } from 'node:crypto'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('@/lib/registration/actions', () => ({
  createRegistrationFromExternalPayment: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueGhlSync: vi.fn(),
}))
vi.mock('@/lib/entitlements', () => ({
  isOrgEntitled: vi.fn(),
}))
vi.mock('@/lib/ghl/post-registration-writeback', () => ({
  postRegistrationWriteback: vi.fn(),
}))

import { POST } from './route'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRegistrationFromExternalPayment } from '@/lib/registration/actions'
import { enqueueGhlSync } from '@/lib/trigger'
import { isOrgEntitled } from '@/lib/entitlements'
import { postRegistrationWriteback } from '@/lib/ghl/post-registration-writeback'

const BASE_URL = 'http://localhost/api/ghl/webhooks/app'

// Real Ed25519 keypair; the verifier is pointed at our public key via the env
// override so the route's genuine signature check runs unmocked.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const ORDER_ID = '6a29860b81e15e61c41efc68'
const LOCATION_ID = '4KrDX2FYA2XZ68q88rFS'
const CONTACT_ID = 'en8KY8AzRr9btXlY6gfL'
const PRODUCT_ID = '6a297ae626cf1c71c33a69b2'
const PRICE_ID = '6a297aed1c08dd454db138dd'
const ORG_ID = 'org-uuid-1'

// G27 flat app-webhook shape — ids at the top level, no order.line_items.meta
// nesting. contactSnapshot carries firstName + lastName and NO name/full_name
// key, and no phone key at all: that is what GHL actually sends, proven by the
// live cross-transport order. The earlier fixture here used `name` and a phone,
// which is why the route's name mapping passed tests while rejecting every real
// payload as bad_shape. A fixture that does not match production is worse than
// no fixture — it manufactures confidence.
const COMPLETED_ORDER = {
  type: 'OrderStatusUpdate',
  status: 'completed',
  _id: ORDER_ID,
  locationId: LOCATION_ID,
  contactId: CONTACT_ID,
  amount: 225,
  currency: 'USD',
  // No paymentGateway key: the verbatim capture below proves GHL does not send
  // one. Keeping a fabricated 'stripe' here would misinform the next reader the
  // same way the fabricated `name` key did.
  contactSnapshot: {
    email: 'test@prezva.app',
    firstName: 'Test',
    lastName: 'Attendee',
  },
  items: [
    { qty: 1, price: { _id: PRICE_ID }, product: { _id: PRODUCT_ID } },
  ],
}

// VERBATIM LIVE CAPTURE — GHL webhook delivery 26324bfe-8859-43b0-adb9-d32e706c6a96,
// order 6a87abee7ec1ad578d6029c4 ("Cross Test1"), the cross-transport order that
// exposed the attendeeName bug. Copied byte-for-byte from the GHL dashboard
// delivery log; do NOT trim it to the fields the route happens to read. Its value
// is precisely the fields nobody thought to look at — that is the class of bug
// this fixture exists to catch, and the reason a hand-built fixture let the
// original defect ship green.
//
// Two shape facts this capture establishes, neither of which was guessable:
//   - contactSnapshot has firstName + lastName and NO name/full_name/phone
//   - there is NO paymentGateway key anywhere; the gateway lives nowhere in the
//     payload (`source` describes the payment link, not the processor)
const LIVE_CROSS_TEST1_ORDER = {
  type: 'OrderStatusUpdate',
  locationId: '4KrDX2FYA2XZ68q88rFS',
  versionId: '6a049dcb8d20f974bd95d587',
  appId: '6a049dcb8d20f974bd95d587',
  _id: '6a87abee7ec1ad578d6029c4',
  altId: '4KrDX2FYA2XZ68q88rFS',
  altType: 'location',
  status: 'completed',
  taxSummary: [],
  fulfillmentStatus: 'unfulfilled',
  contactId: 'vx2nqEZJYkRIau7Jyf7r',
  currency: 'USD',
  amount: 225,
  liveMode: false,
  amountSummary: {
    subtotal: 225,
    discount: 0,
    tax: 0,
    shipping: 0,
    additionalCharge: 0,
  },
  source: {
    type: 'payment_link',
    subType: 'payments_dashboard',
    id: '6a45286aa655fa0b802a22d2',
    name: 'SAUP AICP TEST — DELETE ME',
  },
  createdAt: '2026-08-21T01:37:50.761Z',
  updatedAt: '2026-08-21T01:37:55.204Z',
  contactSnapshot: {
    id: 'vx2nqEZJYkRIau7Jyf7r',
    locationId: '4KrDX2FYA2XZ68q88rFS',
    firstName: 'Cross',
    lastName: 'Test1',
    email: 'sowu.paul+crosstest1@gmail.com',
    additionalEmails: [],
    additionalPhones: [],
    source: 'payment_link',
    tags: [],
    country: 'US',
    dateAdded: '2026-08-21T01:37:50.151Z',
    customFields: [],
  },
  items: [
    {
      name: 'AICP Member — SAUP CE Conference 2026 - AICP Member Rate',
      qty: 1,
      product: {
        _id: '6a441c7d1904696397774e2f',
        name: 'AICP Member — SAUP CE Conference 2026',
        description: 'AICP Member registration for SAUP Annual CE Conference 2026',
        availableInStore: false,
        taxes: [],
        variants: [],
      },
      price: {
        _id: '6a441c7e0b00c58183984676',
        name: 'AICP Member Rate',
        type: 'one_time',
        currency: 'USD',
        amount: 225,
        variantOptionIds: [],
      },
    },
  ],
  timestamp: '2026-08-21T01:37:55.900Z',
  webhookId: '26324bfe-8859-43b0-adb9-d32e706c6a96',
}

const EVENT_ROW = {
  title: 'Test Conference 2026',
  slug: 'test-conf-2026',
  start_at: '2026-09-01T14:00:00Z',
  end_at: '2026-09-01T22:00:00Z',
  timezone: 'America/New_York',
}

function makeRequest(body: object | string, opts: { sign?: boolean; signature?: string } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.signature !== undefined) {
    headers['x-ghl-signature'] = opts.signature
  } else if (opts.sign !== false) {
    headers['x-ghl-signature'] = sign(null, Buffer.from(raw, 'utf8'), privateKey).toString('base64')
  }
  return new NextRequest(BASE_URL, { method: 'POST', body: raw, headers })
}

// Sequential from() queue, retaining chains so tests can assert update payloads.
function makeSequentialClient(responses: Array<{ data: unknown; error?: unknown }>) {
  const chains: Record<string, ReturnType<typeof vi.fn>>[] = []
  const client = {
    from: vi.fn().mockImplementation(() => {
      const resp = responses[chains.length] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockResolvedValue(resp)
      chain.single = vi.fn().mockResolvedValue(resp)
      chains.push(chain as Record<string, ReturnType<typeof vi.fn>>)
      return chain
    }),
  }
  return { client, chains }
}

// The happy-path DB call order: dedup read, sync_state insert, location link,
// mapping, ticket_types, events, then the queued_for_sync update.
function happyResponses(): Array<{ data: unknown; error?: unknown }> {
  return [
    { data: null, error: null },                                   // dedup read: nothing yet
    { data: { id: 'sync-1' }, error: null },                       // insert sync_state
    { data: { org_id: ORG_ID }, error: null },                     // ghl_location_links
    { data: { ticket_type_id: 'tt-1', event_id: 'ev-1', price_cents: 22500, org_id: ORG_ID }, error: null },
    { data: { name: 'General Admission' }, error: null },          // ticket_types
    { data: EVENT_ROW, error: null },                              // events
    { data: null, error: null },                                   // queued_for_sync update
  ]
}

beforeEach(() => {
  vi.stubEnv('GHL_WEBHOOK_PUBLIC_KEY', PUBLIC_PEM)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')
  vi.mocked(enqueueGhlSync).mockReset().mockResolvedValue(null as never)
  vi.mocked(isOrgEntitled).mockReset().mockResolvedValue(true)
  vi.mocked(postRegistrationWriteback).mockReset().mockResolvedValue(undefined)
  vi.mocked(createRegistrationFromExternalPayment).mockReset().mockResolvedValue({
    success: true,
    registrationId: 'reg-uuid-123',
    qrCode: 'qr-abc',
    appAccessToken: 'app-token-xyz',
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/ghl/webhooks/app — signature', () => {
  it('rejects an unsigned request with 401 and writes NO ledger row', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER, { sign: false }))

    expect(res.status).toBe(401)
    // An unauthenticated caller must never be able to write to ghl_sync_state.
    expect(client.from).not.toHaveBeenCalled()
  })

  it('rejects a tampered body with 401 and writes NO ledger row', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const goodSig = sign(null, Buffer.from(JSON.stringify(COMPLETED_ORDER), 'utf8'), privateKey).toString('base64')
    const res = await POST(makeRequest({ ...COMPLETED_ORDER, amount: 1 }, { signature: goodSig }))

    expect(res.status).toBe(401)
    expect(client.from).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/app — event policy', () => {
  it('ignores OrderCreate with 200 and no ledger row', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest({ ...COMPLETED_ORDER, type: 'OrderCreate', status: 'pending' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored_pending' })
    expect(client.from).not.toHaveBeenCalled()
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })

  it('ignores OrderStatusUpdate whose status is not completed', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest({ ...COMPLETED_ORDER, status: 'pending' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored_not_completed' })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('ignores an unhandled event type', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest({ ...COMPLETED_ORDER, type: 'SomethingElse' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored_unhandled_type' })
  })

  it('processes a completed OrderStatusUpdate end to end', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.status).toBe('accepted')
    expect(json.registrationId).toBe('reg-uuid-123')
    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'ev-1',
        ticketTypeId: 'tt-1',
        attendeeEmail: 'test@prezva.app',
        attendeeName: 'Test Attendee',
        externalOrderId: ORDER_ID,
        externalSource: 'ghl_payment',
        amountPaidCents: 22500,
      }),
    )
    expect(enqueueGhlSync).toHaveBeenCalled()
    expect(postRegistrationWriteback).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, syncStateId: 'sync-1', contactId: CONTACT_ID }),
    )
  })
})

// ── THE TRANSITION PROPERTY ───────────────────────────────────────────────────
// Both transports fire for every order until the workflow webhook action is
// removed from the snapshot. If these ever fail, the two transports have stopped
// sharing an idempotency key and every order in the transition window produces
// two registrations, two enqueues, and two calendar appointments.
describe('POST /api/ghl/webhooks/app — cross-transport dedup', () => {
  it('reads already-processed when the WORKFLOW route already wrote the shared triple (queued_for_sync)', async () => {
    const { client, chains } = makeSequentialClient([
      { data: { id: 'sync-existing', status: 'queued_for_sync', dead_lettered: false }, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'duplicate' })
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
    expect(enqueueGhlSync).not.toHaveBeenCalled()
    expect(postRegistrationWriteback).not.toHaveBeenCalled()

    // The lookup must use the exact triple the workflow route writes.
    expect(chains[0].eq).toHaveBeenCalledWith('source', 'ghl_payment')
    expect(chains[0].eq).toHaveBeenCalledWith('event_type', 'order_submitted')
    expect(chains[0].eq).toHaveBeenCalledWith('external_event_id', ORDER_ID)
  })

  it('reads already-processed when the row is already synced', async () => {
    const { client } = makeSequentialClient([
      { data: { id: 'sync-existing', status: 'synced', dead_lettered: false }, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(await res.json()).toEqual({ status: 'duplicate' })
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })

  it('writes the shared triple so the WORKFLOW route dedups against this route', async () => {
    const { client, chains } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest(COMPLETED_ORDER))

    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'ghl_payment',
        event_type: 'order_submitted',
        external_event_id: ORDER_ID,
        location_id: LOCATION_ID,
        ghl_contact_id: CONTACT_ID,
      }),
    )
  })

  it('resumes a pending row rather than inserting a second one', async () => {
    const responses = happyResponses()
    responses[0] = { data: { id: 'sync-pending', status: 'pending', dead_lettered: false }, error: null }
    responses.splice(1, 1) // no insert happens on the resume path
    const { client, chains } = makeSequentialClient(responses)
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect((await res.json()).status).toBe('accepted')
    expect(chains[1].insert).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/app — response semantics (GHL retries any non-2xx)', () => {
  it('bad_shape: signed but unparseable JSON returns 200, never a retryable code', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest('{not json at all'))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'bad_shape' })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('bad_shape: missing required ids returns 200 with no ledger row', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const { contactId: _drop, ...noContact } = COMPLETED_ORDER
    const res = await POST(makeRequest(noContact))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'bad_shape' })
    expect(client.from).not.toHaveBeenCalled()
  })

  it('location_not_bound: 200 with a ledger row marked failed', async () => {
    const { client, chains } = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'sync-1' }, error: null },
      { data: null, error: null }, // no location link
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'location_not_bound' })
    expect(chains[3].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', last_error: 'location_not_bound' }),
    )
  })

  it('ticket_not_mapped: 200 with a ledger row marked failed', async () => {
    const { client, chains } = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'sync-1' }, error: null },
      { data: { org_id: ORG_ID }, error: null },
      { data: null, error: null }, // no mapping
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ticket_not_mapped' })
    expect(chains[4].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', last_error: 'ticket_not_mapped' }),
    )
  })

  it('ticket_mapping_ambiguous: distinct from not_mapped, 200, no registration', async () => {
    const { client } = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'sync-1' }, error: null },
      { data: { org_id: ORG_ID }, error: null },
      { data: null, error: { message: 'multiple rows returned' } },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(await res.json()).toEqual({ status: 'ticket_mapping_ambiguous' })
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })

  it('tenant_mismatch: 200, ledger row, no registration', async () => {
    const responses = happyResponses()
    responses[3] = {
      data: { ticket_type_id: 'tt-1', event_id: 'ev-1', price_cents: 22500, org_id: 'org-DIFFERENT' },
      error: null,
    }
    const { client } = makeSequentialClient(responses)
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'tenant_mismatch' })
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })

  it('entitlement_blocked: 200, ledger row, no registration', async () => {
    vi.mocked(isOrgEntitled).mockResolvedValue(false)
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'entitlement_blocked' })
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })

  it('transient: a sync_state insert failure returns 500 so GHL retries', async () => {
    const { client } = makeSequentialClient([
      { data: null, error: null },
      { data: null, error: { message: 'connection reset' } },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(500)
  })

  it('transient: an unexpected throw returns 500', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('supabase exploded')
    })

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(500)
  })

  it('waitlisted: capacity reached returns 200 waitlisted, not an error', async () => {
    vi.mocked(createRegistrationFromExternalPayment).mockResolvedValue({
      success: false, error: 'Event is at capacity', waitlisted: true,
    })
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(COMPLETED_ORDER))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'waitlisted' })
  })
})

describe('POST /api/ghl/webhooks/app — payload mapping', () => {
  it('maps the flat G27 shape: items[0].price/product, contactSnapshot, top-level ids', async () => {
    const { client, chains } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest(COMPLETED_ORDER))

    expect(chains[3].eq).toHaveBeenCalledWith('ghl_product_id', PRODUCT_ID)
    expect(chains[3].eq).toHaveBeenCalledWith('ghl_price_id', PRICE_ID)
    expect(chains[3].eq).toHaveBeenCalledWith('ghl_location_id', LOCATION_ID)
  })

  it('converts amount x100 as presumed dollars and logs the raw value beside the mapping price for the unit read', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest(COMPLETED_ORDER))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaidCents: 22500 }),
    )
    // The evidence line the rehearsal reads to settle the unit question.
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('amount unit check'),
      expect.objectContaining({ rawAmount: 225, convertedCents: 22500, mappingPriceCents: 22500 }),
    )
  })

  it('carries seatQty through for observability without acting on it', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest({ ...COMPLETED_ORDER, items: [{ qty: 3, price: { _id: PRICE_ID }, product: { _id: PRODUCT_ID } }] }))

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('order received'),
      expect.objectContaining({ seatQty: 3 }),
    )
    // Still exactly one registration: quantity is not yet acted on (R30 stands).
    expect(createRegistrationFromExternalPayment).toHaveBeenCalledTimes(1)
  })
})

// ── Regression: attendeeName from contactSnapshot firstName/lastName ──────────
// The live cross-transport order 200'd as bad_shape and created nothing, because
// the route read contactSnapshot.name ?? full_name — keys the real payload does
// not have. The sanitizer then rejected the empty name (invalid_name), correctly.
describe('POST /api/ghl/webhooks/app — contactSnapshot name mapping', () => {
  it('parses the live Cross Test1 order and joins firstName + lastName', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest(LIVE_CROSS_TEST1_ORDER))
    const json = await res.json()

    // Reaches 'accepted', not 'bad_shape' — the whole point of the fix.
    expect(res.status).toBe(200)
    expect(json.status).toBe('accepted')

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        attendeeName: 'Cross Test1',
        // No phone key in the payload at all — optional, so it lands as null
        // rather than failing the parse.
        attendeePhone: null,
        amountPaidCents: 22500,
        externalOrderId: '6a87abee7ec1ad578d6029c4',
      }),
    )
  })

  it('logs seatQty 1 and the confirmed-dollars evidence line for the live order', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest(LIVE_CROSS_TEST1_ORDER))

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('order received'),
      expect.objectContaining({ seatQty: 1 }),
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('amount unit check'),
      expect.objectContaining({ rawAmount: 225, convertedCents: 22500 }),
    )
  })

  it('ignores the same live order as OrderCreate/pending without touching the DB', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(
      makeRequest({ ...LIVE_CROSS_TEST1_ORDER, type: 'OrderCreate', status: 'pending' }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ignored_pending' })
    expect(client.from).not.toHaveBeenCalled()
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })

  it('accepts a contact with only a firstName', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest({
      ...LIVE_CROSS_TEST1_ORDER,
      contactSnapshot: { email: 'solo@prezva.app', firstName: 'Cher' },
    }))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeName: 'Cher' }),
    )
  })

  it('accepts a contact with only a lastName', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest({
      ...LIVE_CROSS_TEST1_ORDER,
      contactSnapshot: { email: 'solo@prezva.app', lastName: 'Prince' },
    }))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeName: 'Prince' }),
    )
  })

  it('trims whitespace-padded parts rather than emitting a double space', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest({
      ...LIVE_CROSS_TEST1_ORDER,
      contactSnapshot: { email: 'pad@prezva.app', firstName: '  Cross  ', lastName: '  Test1  ' },
    }))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeName: 'Cross Test1' }),
    )
  })

  it('falls back to a singular name key when no parts are present', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest({
      ...LIVE_CROSS_TEST1_ORDER,
      contactSnapshot: { email: 'fb@prezva.app', name: 'Legacy Shape' },
    }))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeName: 'Legacy Shape' }),
    )
  })

  it('falls back to full_name when neither parts nor name are present', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    await POST(makeRequest({
      ...LIVE_CROSS_TEST1_ORDER,
      contactSnapshot: { email: 'fb2@prezva.app', full_name: 'Workflow Shape' },
    }))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeName: 'Workflow Shape' }),
    )
  })

  // Rejecting is correct here: a placeholder name would ride onto a real badge
  // and a real certificate. bad_shape is 200 so GHL stops retrying a payload
  // that will never improve.
  it('returns bad_shape when no usable name exists in any shape', async () => {
    const { client } = makeSequentialClient([])
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    const res = await POST(makeRequest({
      ...LIVE_CROSS_TEST1_ORDER,
      contactSnapshot: { email: 'nameless@prezva.app' },
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'bad_shape' })
    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
  })
})

// ── Finding from the verbatim capture ─────────────────────────────────────────
// The live payload has NO paymentGateway key. `source` describes the payment
// LINK (type: 'payment_link', subType: 'payments_dashboard'), not the processor
// that moved the money, so there is nothing in the app-webhook envelope to read
// a gateway from. The route therefore records 'unknown' for every app-transport
// order — where the workflow transport read order.payment_gateway and recorded
// 'stripe'.
//
// Pinned rather than fixed: inventing 'stripe' here would be a guess written
// into a payments column. Resolving it properly needs either a GHL transaction
// lookup or a decision that 'unknown' is acceptable for this transport — a
// separate call, not a silent default. This test exists so the gap is visible
// and so a future fix has something to flip.
describe('POST /api/ghl/webhooks/app — known gap: payment gateway', () => {
  it('records paymentGateway "unknown" because the live payload carries no gateway field', async () => {
    const { client } = makeSequentialClient(happyResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as never)

    expect('paymentGateway' in LIVE_CROSS_TEST1_ORDER).toBe(false)

    await POST(makeRequest(LIVE_CROSS_TEST1_ORDER))

    expect(createRegistrationFromExternalPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentGateway: 'unknown' }),
    )
  })
})
