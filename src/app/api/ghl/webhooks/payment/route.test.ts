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

import { POST } from './route'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRegistrationFromExternalPayment } from '@/lib/registration/actions'
import { enqueueGhlSync } from '@/lib/trigger'
import { ghlPut } from '@/lib/integrations/ghl/client'
import { getGhlToken } from '@/lib/integrations/ghl/token'
import { GHL_FIELD_KEYS } from '@/lib/integrations/ghl/config'

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
  })
  vi.mocked(getGhlToken).mockReturnValue('test-token')
  vi.mocked(ghlPut).mockResolvedValue({} as any)
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

describe('POST /api/ghl/webhooks/payment — happy path', () => {
  it('returns accepted with registrationId and entryUrl', async () => {
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
    expect(json.entryUrl).toBe('https://prezva.app/e/test-conf-2026/enter?reg=reg-uuid-123')

    expect(vi.mocked(ghlPut)).toHaveBeenCalledOnce()
    expect(vi.mocked(ghlPut)).toHaveBeenCalledWith(
      'test-token',
      `/contacts/${LIVE_PAYLOAD.contact_id}`,
      { customFields: [{ id: GHL_FIELD_KEYS.prezvaAttendeeLink, value: 'https://prezva.app/e/test-conf-2026/enter?reg=reg-uuid-123' }] },
    )
  })
})
