// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueWaitlistProcessing: vi.fn(),
}))

import { POST } from './route'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueWaitlistProcessing } from '@/lib/trigger'

const CORRECT_SECRET = 'test-webhook-secret-32-chars-longg'
const BASE_URL = 'http://localhost/api/ghl/webhooks/refund'

// Fixture from the merged-queue item: reg 417b5587-e1f7-4e5d-b248-3a7d8d981009,
// external_order_id 6a45295be8b92c36872a71be ($225, completed/paid, GHL test mode).
const GHL_ORDER_ID = '6a45295be8b92c36872a71be'
const REG_ID = '417b5587-e1f7-4e5d-b248-3a7d8d981009'
const AMOUNT_PAID_CENTS = 22500

const REFUND_PAYLOAD = {
  order: {
    line_items: [
      { meta: { order_id: GHL_ORDER_ID } },
    ],
  },
}

function makeRequest(secret: string | null, body: object = REFUND_PAYLOAD) {
  const url = secret !== null ? `${BASE_URL}?secret=${encodeURIComponent(secret)}` : BASE_URL
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

// Sequential mock: each from() call consumes the next response in the queue,
// and the created chain is retained so tests can assert on update() payloads.
function makeSequentialClient(responses: Array<{ data: unknown; error?: unknown }>) {
  const chains: Record<string, ReturnType<typeof vi.fn>>[] = []
  const client = {
    from: vi.fn().mockImplementation(() => {
      const resp = responses[chains.length] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq     = vi.fn().mockReturnValue(chain)
      chain.neq    = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockResolvedValue(resp)
      chain.single      = vi.fn().mockResolvedValue(resp)
      chains.push(chain as Record<string, ReturnType<typeof vi.fn>>)
      return chain
    }),
  }
  return { client, chains }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('GHL_WEBHOOK_SECRET', CORRECT_SECRET)
  vi.mocked(enqueueWaitlistProcessing).mockResolvedValue(null as any)
})

describe('POST /api/ghl/webhooks/refund — auth', () => {
  it('returns 401 when secret query param is missing', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when secret is wrong (timingSafeEqual enforced, not ==)', async () => {
    const wrongSameLength = 'test-webhook-secret-32-chars-wrongg'
    const res = await POST(makeRequest(wrongSameLength))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/ghl/webhooks/refund — order id resolution', () => {
  it('returns 200 unresolved_order_id and performs no DB write when no candidate path matches', async () => {
    vi.mocked(createAdminClient)

    const res = await POST(makeRequest(CORRECT_SECRET, { nothing: 'here' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: false, reason: 'unresolved_order_id' })
    // createAdminClient must never even be reached
    expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
    expect(vi.mocked(enqueueWaitlistProcessing)).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/refund — registration lookup', () => {
  it('returns 200 registration_not_found when no registration matches external_order_id', async () => {
    const { client } = makeSequentialClient([
      { data: null, error: null }, // registrations select — no match
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: false, reason: 'registration_not_found' })
    expect(vi.mocked(enqueueWaitlistProcessing)).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/refund — idempotency', () => {
  it('is a no-op and does NOT enqueue when registration is already refunded', async () => {
    const { client, chains } = makeSequentialClient([
      {
        data: {
          id: REG_ID,
          event_id: 'ev-uuid-1',
          amount_paid_cents: AMOUNT_PAID_CENTS,
          status: 'refunded',
          events: { title: 'Test Conference 2026', slug: 'test-conf-2026' },
        },
        error: null,
      },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, status: 'already_refunded' })

    // Only one from() call (the lookup) — no update call was made
    expect(chains.length).toBe(1)
    expect(vi.mocked(enqueueWaitlistProcessing)).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/refund — full refund', () => {
  it('writes status=refunded + refunded_at + refund_amount_cents and enqueues waitlist processing', async () => {
    const { client, chains } = makeSequentialClient([
      {
        data: {
          id: REG_ID,
          event_id: 'ev-uuid-1',
          amount_paid_cents: AMOUNT_PAID_CENTS,
          status: 'confirmed',
          events: { title: 'Test Conference 2026', slug: 'test-conf-2026' },
        },
        error: null,
      },
      { data: { id: REG_ID }, error: null }, // registrations update — row flipped
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    // No determinable amount in payload -> treated as a full refund of amount_paid_cents
    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, status: 'refunded' })

    expect(chains[1].update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'refunded',
        refunded_at: expect.any(String),
        refund_amount_cents: AMOUNT_PAID_CENTS,
      }),
    )
    expect(chains[1].eq).toHaveBeenCalledWith('id', REG_ID)

    expect(vi.mocked(enqueueWaitlistProcessing)).toHaveBeenCalledWith({
      eventId: 'ev-uuid-1',
      eventTitle: 'Test Conference 2026',
      eventSlug: 'test-conf-2026',
    })
  })

  it('logs and skips the enqueue (without failing) when event title/slug cannot be resolved', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { client, chains } = makeSequentialClient([
      {
        data: {
          id: REG_ID,
          event_id: 'ev-uuid-1',
          amount_paid_cents: AMOUNT_PAID_CENTS,
          status: 'confirmed',
          events: null, // embed failed to resolve
        },
        error: null,
      },
      { data: { id: REG_ID }, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, status: 'refunded' })

    expect(chains[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'refunded', refund_amount_cents: AMOUNT_PAID_CENTS }),
    )
    expect(vi.mocked(enqueueWaitlistProcessing)).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      '[ghl-refund] full refund but event title/slug unresolved — seat NOT freed',
    )
    logSpy.mockRestore()
  })
})

describe('POST /api/ghl/webhooks/refund — partial refund', () => {
  it('writes refund_amount_cents only and does NOT enqueue', async () => {
    const { client, chains } = makeSequentialClient([
      {
        data: {
          id: REG_ID,
          event_id: 'ev-uuid-1',
          amount_paid_cents: AMOUNT_PAID_CENTS,
          status: 'confirmed',
          events: { title: 'Test Conference 2026', slug: 'test-conf-2026' },
        },
        error: null,
      },
      { data: { id: REG_ID }, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    // GHL sends dollars — $50 of a $225 registration is a partial refund.
    const partialPayload = { ...REFUND_PAYLOAD, refund: { amount: 50 } }
    const res = await POST(makeRequest(CORRECT_SECRET, partialPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, status: 'partial_refund' })

    expect(chains[1].update).toHaveBeenCalledWith({ refund_amount_cents: 5000 })
    expect(vi.mocked(enqueueWaitlistProcessing)).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/refund — idempotency race (TOCTOU)', () => {
  it('is a no-op and does NOT enqueue when a concurrent delivery wins the race between read and write', async () => {
    // Initial read sees a pre-refund status, but the compare-and-swap update
    // (.neq('status', 'refunded')) returns no row because another concurrent
    // delivery already flipped it to refunded first.
    const { client, chains } = makeSequentialClient([
      {
        data: {
          id: REG_ID,
          event_id: 'ev-uuid-1',
          amount_paid_cents: AMOUNT_PAID_CENTS,
          status: 'confirmed',
          events: { title: 'Test Conference 2026', slug: 'test-conf-2026' },
        },
        error: null,
      },
      { data: null, error: null }, // update raced and lost — no row flipped
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, status: 'already_refunded' })

    expect(chains[1].neq).toHaveBeenCalledWith('status', 'refunded')
    expect(vi.mocked(enqueueWaitlistProcessing)).not.toHaveBeenCalled()
  })
})

describe('POST /api/ghl/webhooks/refund — units (GHL sends dollars, Prezva stores cents)', () => {
  it('a $225 full refund payload against amount_paid_cents=22500 writes refund_amount_cents=22500, flips to refunded, and enqueues', async () => {
    const { client, chains } = makeSequentialClient([
      {
        data: {
          id: REG_ID,
          event_id: 'ev-uuid-1',
          amount_paid_cents: AMOUNT_PAID_CENTS, // 22500
          status: 'confirmed',
          events: { title: 'Test Conference 2026', slug: 'test-conf-2026' },
        },
        error: null,
      },
      { data: { id: REG_ID }, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    // GHL sends the refund amount in dollars, same as order.total_price on the payment webhook.
    const dollarAmountPayload = { ...REFUND_PAYLOAD, refund: { amount: 225 } }
    const res = await POST(makeRequest(CORRECT_SECRET, dollarAmountPayload))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, status: 'refunded' })

    expect(chains[1].update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'refunded',
        refunded_at: expect.any(String),
        refund_amount_cents: AMOUNT_PAID_CENTS,
      }),
    )
    expect(vi.mocked(enqueueWaitlistProcessing)).toHaveBeenCalledWith({
      eventId: 'ev-uuid-1',
      eventTitle: 'Test Conference 2026',
      eventSlug: 'test-conf-2026',
    })
  })
})
