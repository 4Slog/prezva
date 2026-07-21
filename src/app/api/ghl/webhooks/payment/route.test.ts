// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('@/lib/registration/actions', () => ({
  createRegistrationFromExternalPayment: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueGhlSync: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlPut: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/token', () => ({
  getGhlToken: vi.fn(),
}))
// Partial mock: keep the real buildStageTagMaps (config.ts calls it at module
// load) and only stub getGhlOrgConfig, which this test controls directly —
// avoids adding a new admin.from() call to the sequential mock call order.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})
// isOrgEntitled is mocked (not left real) specifically so it does NOT consume
// a slot in the sequential admin.from() mock queue below — every existing
// test's response array and index-based assertions stay untouched. Defaults
// to entitled so none of them need to know this check exists.
vi.mock('@/lib/entitlements', () => ({
  isOrgEntitled: vi.fn(),
}))

import { POST } from './route'
import { isOrgEntitled } from '@/lib/entitlements'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRegistrationFromExternalPayment } from '@/lib/registration/actions'
import { enqueueGhlSync } from '@/lib/trigger'
import { ghlPut } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  GHL_FIELD_KEYS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_STAGE_IDS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

// Built from the legacy constants so this fixture can't drift from production values.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS,
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
}

const CORRECT_SECRET = 'test-webhook-secret-32-chars-longg'
const BASE_URL = 'http://localhost/api/ghl/webhooks/payment'

// Live payload shape captured from GHL workflow webhook (2026-06-10)
const LIVE_PAYLOAD = {
  contact_id: 'en8KY8AzRr9btXlY6gfL',
  full_name: 'Test Attendee',
  email: 'test@prezva.app',
  phone: '+14045550000',
  location: { id: '4KrDX2FYA2XZ68q88rFS', name: '4S Logistics' },
  order: {
    payment_gateway: 'stripe',
    currency_code: 'USD',
    total_price: 2500,
    line_items: [
      {
        meta: {
          product_id: '6a297ae626cf1c71c33a69b2',
          price_id: '6a297aed1c08dd454db138dd',
          order_id: '6a29860b81e15e61c41efc68',
        },
      },
    ],
  },
}

function makeRequest(secret: string | null, body: object = LIVE_PAYLOAD) {
  const url = secret !== null ? `${BASE_URL}?secret=${encodeURIComponent(secret)}` : BASE_URL
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

// Sequential mock: each from() call consumes the next response in the queue.
// Makes test setup explicit about the exact DB call order in the route.
function makeSequentialClient(responses: Array<{ data: unknown; error?: unknown }>) {
  let idx = 0
  return {
    from: vi.fn().mockImplementation(() => {
      const resp = responses[idx++] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq     = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockResolvedValue(resp)
      chain.single      = vi.fn().mockResolvedValue(resp)
      return chain
    }),
  }
}

beforeEach(() => {
  vi.stubEnv('GHL_WEBHOOK_SECRET', CORRECT_SECRET)
  vi.mocked(enqueueGhlSync).mockResolvedValue(null as any)
  vi.mocked(createRegistrationFromExternalPayment).mockResolvedValue({
    success: true,
    registrationId: 'reg-uuid-123',
    qrCode: 'qr-abc-def',
    appAccessToken: 'app-access-token-xyz',
  })
  vi.mocked(getGhlToken).mockReturnValue('test-token')
  vi.mocked(ghlPut).mockResolvedValue({} as any)
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
  vi.mocked(isOrgEntitled).mockReset().mockResolvedValue(true)
})

describe('POST /api/ghl/webhooks/payment — auth', () => {
  it('returns 401 when secret query param is missing', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when secret is wrong (timingSafeEqual enforced, not ==)', async () => {
    // Use a secret of same length as CORRECT_SECRET to rule out length short-circuit
    const wrongSameLength = 'test-webhook-secret-32-chars-wrongg'
    const res = await POST(makeRequest(wrongSameLength))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/ghl/webhooks/payment — field validation', () => {
  it('returns 400 missing_required_fields when order_id is absent', async () => {
    const badBody = {
      ...LIVE_PAYLOAD,
      order: {
        ...LIVE_PAYLOAD.order,
        line_items: [{ meta: { product_id: 'p1', price_id: 'pr1' /* no order_id */ } }],
      },
    }
    const res = await POST(makeRequest(CORRECT_SECRET, badBody))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('missing_required_fields')
  })
})

describe('POST /api/ghl/webhooks/payment — idempotency', () => {
  it('returns 200 already_processed when ghl_sync_state row status is synced', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSequentialClient([
        { data: { id: 'state-1', status: 'synced', dead_lettered: false }, error: null },
      ]) as any,
    )

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('already_processed')
  })
})

describe('POST /api/ghl/webhooks/payment — org lookup', () => {
  it('returns 400 location_not_bound when no ghl_location_links row matches', async () => {
    // Call order: [0] ghl_sync_state select (no row), [1] ghl_sync_state insert, [2] ghl_location_links (null), [3] ghl_sync_state update
    vi.mocked(createAdminClient).mockReturnValue(
      makeSequentialClient([
        { data: null, error: null },               // ghl_sync_state select — no existing
        { data: { id: 'state-new' }, error: null }, // ghl_sync_state insert
        { data: null, error: null },               // ghl_location_links — not bound
        { data: null, error: null },               // ghl_sync_state update (status=failed)
      ]) as any,
    )

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('location_not_bound')
  })
})

describe('POST /api/ghl/webhooks/payment — ticket mapping', () => {
  it('returns 400 ticket_not_mapped when no ticket_type_product_mappings row matches', async () => {
    // Call order: [0] ghl_sync_state select, [1] ghl_sync_state insert, [2] ghl_location_links (found),
    //             [3] ticket_type_product_mappings (null), [4] ghl_sync_state update (status=failed)
    vi.mocked(createAdminClient).mockReturnValue(
      makeSequentialClient([
        { data: null, error: null },
        { data: { id: 'state-new' }, error: null },
        { data: { org_id: 'org-uuid-1' }, error: null },
        { data: null, error: null },
        { data: null, error: null },
      ]) as any,
    )

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('ticket_not_mapped')
  })
})

describe('POST /api/ghl/webhooks/payment — entitlement backstop', () => {
  it('unentitled org -> no registration created, ledger records entitlement_blocked, returns 200 (loud, not silent)', async () => {
    vi.mocked(isOrgEntitled).mockResolvedValue(false)
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Call order: [0] ghl_sync_state select, [1] insert, [2] ghl_location_links,
    // [3] ticket_type_product_mappings, [4] ticket_types, [5] events,
    // [6] ghl_sync_state update (entitlement_blocked) — createRegistrationFromExternalPayment
    // is never reached, so there is no further DB call after this one.
    const client = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1' }, error: null },
      { data: { name: 'General Admission' }, error: null },
      { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
      { data: null, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('entitlement_blocked')

    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
    expect(enqueueGhlSync).not.toHaveBeenCalled()

    expect(client.from.mock.calls.length).toBe(7)
    const finalUpdateArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(finalUpdateArgs).toEqual(expect.objectContaining({ status: 'failed', last_error: 'entitlement_blocked' }))

    expect(consoleErr).toHaveBeenCalledWith(expect.stringContaining('entitlement_blocked'))
    consoleErr.mockRestore()
  })

  it('checks entitlement against the resolved org (entitled org proceeds normally)', async () => {
    vi.mocked(isOrgEntitled).mockResolvedValue(true)
    const client = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1' }, error: null },
      { data: { name: 'General Admission' }, error: null },
      { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
      { data: null, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
    expect(isOrgEntitled).toHaveBeenCalledWith('org-uuid-1')
  })
})

describe('POST /api/ghl/webhooks/payment — happy path', () => {
  it('returns accepted with registrationId and an /app-access entryUrl (I10 cross-device link)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')

    // Call order: [0] ghl_sync_state select (none), [1] ghl_sync_state insert,
    //             [2] ghl_location_links (found), [3] ticket_type_product_mappings (found),
    //             [4] ticket_types (Promise.all first), [5] events (Promise.all second),
    //             [6] ghl_sync_state update (queued_for_sync)
    vi.mocked(createAdminClient).mockReturnValue(
      makeSequentialClient([
        { data: null, error: null },
        { data: { id: 'state-new' }, error: null },
        { data: { org_id: 'org-uuid-1' }, error: null },
        { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1' }, error: null },
        { data: { name: 'General Admission' }, error: null },
        { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
        { data: null, error: null },
      ]) as any,
    )

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
    expect(json.registrationId).toBe('reg-uuid-123')
    expect(json.entryUrl).toBe('https://prezva.app/e/test-conf-2026/app-access?t=app-access-token-xyz')

    expect(vi.mocked(ghlPut)).toHaveBeenCalledOnce()
    expect(vi.mocked(ghlPut)).toHaveBeenCalledWith(
      'test-token',
      `/contacts/${LIVE_PAYLOAD.contact_id}`,
      { customFields: [{ id: GHL_FIELD_KEYS.prezvaAttendeeLink, value: 'https://prezva.app/e/test-conf-2026/app-access?t=app-access-token-xyz' }] },
    )
  })

  it('falls back to /enter?reg= when no appAccessToken is available', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')
    vi.mocked(createRegistrationFromExternalPayment).mockResolvedValueOnce({
      success: true,
      registrationId: 'reg-uuid-123',
      qrCode: 'qr-abc-def',
      appAccessToken: '',
    })

    vi.mocked(createAdminClient).mockReturnValue(
      makeSequentialClient([
        { data: null, error: null },
        { data: { id: 'state-new' }, error: null },
        { data: { org_id: 'org-uuid-1' }, error: null },
        { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1' }, error: null },
        { data: { name: 'General Admission' }, error: null },
        { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
        { data: null, error: null },
      ]) as any,
    )

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.entryUrl).toBe('https://prezva.app/e/test-conf-2026/enter?reg=reg-uuid-123')
  })
})

describe('POST /api/ghl/webhooks/payment — amount divergence (R30 multi-seat tripwire)', () => {
  function bodyWithTotal(totalPrice: number) {
    return {
      ...LIVE_PAYLOAD,
      order: { ...LIVE_PAYLOAD.order, total_price: totalPrice },
    }
  }

  // Call order (mapped + no divergence): [0] ghl_sync_state select, [1] ghl_sync_state insert,
  // [2] ghl_location_links, [3] ticket_type_product_mappings, [4] ticket_types, [5] events,
  // [6] ghl_sync_state update (queued_for_sync). A divergence/unverifiable write inserts one
  // extra update between [5] and the final one.
  function baseResponses(priceCents: number | null) {
    return [
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', price_cents: priceCents }, error: null },
      { data: { name: 'General Admission' }, error: null },
      { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
    ]
  }

  it('paid == expected -> no divergence recorded, registration created, status unchanged', async () => {
    const client = makeSequentialClient([
      ...baseResponses(22500),
      { data: null, error: null }, // queued_for_sync update
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET, bodyWithTotal(225)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')

    expect(client.from.mock.calls.length).toBe(7)
    const finalUpdateArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(finalUpdateArgs.status).toBe('queued_for_sync')
    expect(finalUpdateArgs.last_error).toBeUndefined()
  })

  it('paid is an exact multiple of expected (3 seats, 67500 vs 22500) -> divergence recorded, registration STILL created', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = makeSequentialClient([
      ...baseResponses(22500),
      { data: null, error: null }, // divergence update
      { data: null, error: null }, // queued_for_sync update
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET, bodyWithTotal(675)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
    expect(json.registrationId).toBe('reg-uuid-123')

    const divergenceArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(divergenceArgs.last_error).toBe('amount_divergence: paid=67500 expected=22500')
    expect(divergenceArgs.status).toBeUndefined()

    const finalUpdateArgs = client.from.mock.results[7].value.update.mock.calls[0][0]
    expect(finalUpdateArgs.status).toBe('queued_for_sync')

    expect(consoleErr).toHaveBeenCalledWith(
      '[ghl-webhook] amount divergence — possible multi-seat order:',
      expect.objectContaining({ expectedCents: 22500, paidCents: 67500 }),
    )
    consoleErr.mockRestore()
  })

  it('paid differs by a non-multiple (3 seats + 50% off, 33750 vs 22500) -> divergence recorded, registration STILL created', async () => {
    const client = makeSequentialClient([
      ...baseResponses(22500),
      { data: null, error: null }, // divergence update
      { data: null, error: null }, // queued_for_sync update
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET, bodyWithTotal(337.5)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')

    const divergenceArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(divergenceArgs.last_error).toBe('amount_divergence: paid=33750 expected=22500')
  })

  it('coupon: paid=0 vs expected=22500 (100% comped, registration 61d9ba3f is real) -> NOT flagged, registration STILL created', async () => {
    const client = makeSequentialClient([
      ...baseResponses(22500),
      { data: null, error: null }, // queued_for_sync update
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET, bodyWithTotal(0)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')

    expect(client.from.mock.calls.length).toBe(7)
    const finalUpdateArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(finalUpdateArgs.status).toBe('queued_for_sync')
    expect(finalUpdateArgs.last_error).toBeUndefined()
  })

  it('partial coupon: paid=11250 vs expected=22500 -> not flagged, registration created', async () => {
    const client = makeSequentialClient([
      ...baseResponses(22500),
      { data: null, error: null }, // queued_for_sync update
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET, bodyWithTotal(112.5)))
    expect(res.status).toBe(200)

    expect(client.from.mock.calls.length).toBe(7)
    const finalUpdateArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(finalUpdateArgs.last_error).toBeUndefined()
  })

  it('mapping has price_cents=null -> amount_unverifiable recorded (distinct from divergence), registration STILL created', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = makeSequentialClient([
      ...baseResponses(null),
      { data: null, error: null }, // unverifiable update
      { data: null, error: null }, // queued_for_sync update
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET, bodyWithTotal(225)))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')

    const unverifiableArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(unverifiableArgs.last_error).toBe('amount_unverifiable: paid=22500 expected=null')
    expect(unverifiableArgs.status).toBeUndefined()

    expect(consoleErr).toHaveBeenCalledWith(
      '[ghl-webhook] amount unverifiable — mapping has no price_cents:',
      expect.objectContaining({ paidCents: 22500 }),
    )
    consoleErr.mockRestore()
  })
})
