// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
vi.mock('@/lib/registration/external-payment', () => ({
  createRegistrationFromExternalPayment: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueGhlSync: vi.fn(),
}))
// R56: this file runs the REAL postRegistrationWriteback, so every client export
// the writeback imports must be stubbed here. The writeback's outer catch swallows
// a TypeError from an undefined import — omitting the tag helpers would leave this
// suite green while the tag silently never fires in production.
vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlPut: vi.fn(),
  ghlPost: vi.fn(),
  ghlAddContactTags: vi.fn(),
  ghlRemoveContactTags: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
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
// R55: the verifier is mocked here so its two DB reads (ghl_location_links ->
// ghl_org_config) do not consume slots in the sequential admin.from() queue
// below — every existing response array and index-based assertion in this file
// stays valid. The default implementation reproduces the pre-R55 global-secret
// behaviour exactly, so the 401/200 cases below are unchanged.
// The verifier's own security properties (per-location match, and the one-way
// door that REJECTS the global secret for a hashed location) are covered
// against real crypto in src/lib/ghl/webhook-auth.test.ts. What this file
// asserts is the route's side of the contract: that the location claim is
// parsed out of the body and handed to the verifier.
vi.mock('@/lib/ghl/webhook-auth', () => ({
  verifyWebhookSecret: vi.fn(),
}))

import { POST, eventDateInEventTz } from './route'
import { verifyWebhookSecret } from '@/lib/ghl/webhook-auth'
import { isOrgEntitled } from '@/lib/entitlements'
import { createAdminClient } from '@/lib/supabase/admin'
import { createRegistrationFromExternalPayment } from '@/lib/registration/external-payment'
import { enqueueGhlSync } from '@/lib/trigger'
import { ghlPut, ghlPost } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { getGhlOrgConfig, type GhlOrgConfig } from '@/lib/integrations/ghl/org-config'
import {
  GHL_FIELD_KEYS,
  GHL_EVENTS_PIPELINE_ID,
  GHL_STAGE_IDS,
  GHL_STAGE_TAGS,
  GHL_STAGE_SUPERSEDES_TAGS,
} from '@/lib/integrations/ghl/config'

// Built from the legacy constants so this fixture can't drift from production values.
// Cast: GHL_FIELD_KEYS is SAUP's real 9-key field map — it's missing prezvaEventDate
// (10th field, GE-8) because SAUP hasn't been re-provisioned yet. Not a type escape hatch.
const SAUP_CONFIG: GhlOrgConfig = {
  pipelineId: GHL_EVENTS_PIPELINE_ID,
  stageIds: GHL_STAGE_IDS,
  fieldIds: GHL_FIELD_KEYS as GhlOrgConfig['fieldIds'],
  stageTags: GHL_STAGE_TAGS,
  stageSupersedesTags: GHL_STAGE_SUPERSEDES_TAGS,
  // SAUP hasn't been re-provisioned with a calendar_id — matches production.
  calendarId: null,
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

// secret goes via the X-Prezva-Webhook-Secret header — the only transport the
// route honors post-rotation. querySecret exists solely to prove the retired
// ?secret= query param is now ignored.
function makeRequest(secret: string | null, body: object = LIVE_PAYLOAD, querySecret?: string | null) {
  const url = querySecret ? `${BASE_URL}?secret=${encodeURIComponent(querySecret)}` : BASE_URL
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers['X-Prezva-Webhook-Secret'] = secret
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
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
      // R56: the link-ready claim ends `.is(...).select('id')` and awaits the
      // chain itself rather than maybeSingle/single. Without `is` the claim throws
      // a TypeError into the writeback's outer catch, which silently aborts the
      // rest of the writeback — the appointment POST included. `then` makes the
      // chain awaitable as a terminal, matching PostgREST.
      chain.is     = vi.fn().mockReturnValue(chain)
      chain.maybeSingle = vi.fn().mockResolvedValue(resp)
      chain.single      = vi.fn().mockResolvedValue(resp)
      chain.then = (resolve: (v: unknown) => unknown) => resolve(resp)
      return chain
    }),
  }
}

beforeEach(() => {
  vi.stubEnv('GHL_WEBHOOK_SECRET', CORRECT_SECRET)
  // Mirrors the real global-secret path: header must equal CORRECT_SECRET.
  vi.mocked(verifyWebhookSecret).mockReset().mockImplementation(async (req) => {
    const provided = req.headers.get('x-prezva-webhook-secret')
    return provided === CORRECT_SECRET
      ? { ok: true as const, via: 'global' as const }
      : { ok: false as const, via: null }
  })
  vi.mocked(enqueueGhlSync).mockResolvedValue(null as any)
  vi.mocked(createRegistrationFromExternalPayment).mockResolvedValue({
    success: true,
    registrationId: 'reg-uuid-123',
    qrCode: 'qr-abc-def',
    appAccessToken: 'app-access-token-xyz',
  })
  vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue('test-token')
  vi.mocked(ghlPut).mockResolvedValue({} as any)
  vi.mocked(ghlPost).mockReset()
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(SAUP_CONFIG)
  vi.mocked(isOrgEntitled).mockReset().mockResolvedValue(true)
})

describe('eventDateInEventTz', () => {
  it('formats an instant that rolls back a day in America/New_York', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', 'America/New_York')).toBe('2026-03-14')
  })

  it('formats the same instant as its own calendar date in UTC', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', 'UTC')).toBe('2026-03-15')
  })

  it('returns null for a null startAt', () => {
    expect(eventDateInEventTz(null, 'America/New_York')).toBeNull()
  })

  it('returns null for a null timeZone', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', null)).toBeNull()
  })

  it('returns null rather than throwing for an invalid timeZone', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', 'Not/AZone')).toBeNull()
  })
})

describe('POST /api/ghl/webhooks/payment — auth', () => {
  it('returns 401 when no secret is provided', async () => {
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(401)
  })

  it('returns 401 when the header secret is wrong (timingSafeEqual enforced, not ==)', async () => {
    // Use a secret of same length as CORRECT_SECRET to rule out length short-circuit
    const wrongSameLength = 'test-webhook-secret-32-chars-wrongg'
    const res = await POST(makeRequest(wrongSameLength))
    expect(res.status).toBe(401)
  })

  it('accepts the secret via the X-Prezva-Webhook-Secret header', async () => {
    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).not.toBe(401)
  })

  it('returns 401 when the correct secret is sent via the legacy ?secret= query param (rotation complete — query is no longer honored)', async () => {
    const res = await POST(makeRequest(null, LIVE_PAYLOAD, CORRECT_SECRET))
    expect(res.status).toBe(401)
  })

  it('returns 401 when both header and query secrets are wrong', async () => {
    const wrongSameLength = 'test-webhook-secret-32-chars-wrongg'
    const res = await POST(makeRequest(wrongSameLength, LIVE_PAYLOAD, wrongSameLength))
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

describe('POST /api/ghl/webhooks/payment — ambiguous ticket mapping', () => {
  it('returns 400 ticket_mapping_ambiguous (distinct from ticket_not_mapped) when the mapping lookup errors on 2+ matching rows, and creates no registration', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Call order: [0] ghl_sync_state select, [1] ghl_sync_state insert, [2] ghl_location_links (found),
    //             [3] ticket_type_product_mappings (maybeSingle errors — 2 matching rows), [4] ghl_sync_state update (failed)
    const client = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } },
      { data: null, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('ticket_mapping_ambiguous')

    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
    expect(enqueueGhlSync).not.toHaveBeenCalled()

    expect(client.from.mock.calls.length).toBe(5)
    const finalUpdateArgs = client.from.mock.results[4].value.update.mock.calls[0][0]
    expect(finalUpdateArgs).toEqual(expect.objectContaining({ status: 'failed', last_error: 'ticket_mapping_ambiguous' }))

    expect(consoleErr).toHaveBeenCalledWith(
      expect.stringContaining('Ambiguous ticket mapping'),
      expect.objectContaining({ code: 'PGRST116' }),
    )
    consoleErr.mockRestore()
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
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-1' }, error: null },
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
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-1' }, error: null },
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

  it('tenant_mismatch: mapping.org_id disagrees with the resolved locationLink.org_id -> no registration, ledger records tenant_mismatch, returns 200', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Clear call history accumulated by the preceding "entitled org proceeds
    // normally" test in this describe block — vitest doesn't auto-clear mocks
    // between tests here, and that test legitimately calls these.
    vi.mocked(createRegistrationFromExternalPayment).mockClear()
    vi.mocked(enqueueGhlSync).mockClear()
    vi.mocked(isOrgEntitled).mockClear()

    // Call order: [0] ghl_sync_state select, [1] insert, [2] ghl_location_links (org-uuid-1),
    // [3] ticket_type_product_mappings (org-uuid-DIFFERENT — stale/forged), [4] ticket_types,
    // [5] events, [6] ghl_sync_state update (tenant_mismatch). Never reaches the entitlement
    // check or createRegistrationFromExternalPayment.
    const client = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-DIFFERENT' }, error: null },
      { data: { name: 'General Admission' }, error: null },
      { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
      { data: null, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('tenant_mismatch')

    expect(createRegistrationFromExternalPayment).not.toHaveBeenCalled()
    expect(enqueueGhlSync).not.toHaveBeenCalled()
    expect(isOrgEntitled).not.toHaveBeenCalled()

    expect(client.from.mock.calls.length).toBe(7)
    const finalUpdateArgs = client.from.mock.results[6].value.update.mock.calls[0][0]
    expect(finalUpdateArgs).toEqual(expect.objectContaining({ status: 'failed', last_error: 'tenant_mismatch' }))

    expect(consoleErr).toHaveBeenCalledWith(expect.stringContaining('tenant_mismatch'))
    consoleErr.mockRestore()
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
        { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-1' }, error: null },
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
        { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-1' }, error: null },
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

describe('POST /api/ghl/webhooks/payment — null GHL token (entryUrl write)', () => {
  it('null token: registration still created, last_error written, ghlPut not called, returns 200', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')
    vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue(null)
    // Other tests in this file legitimately call ghlPut; vitest doesn't auto-clear
    // mocks between tests here, so its call count must be cleared explicitly.
    vi.mocked(ghlPut).mockClear()
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Call order: [0] ghl_sync_state select (none), [1] insert, [2] ghl_location_links (found),
    // [3] ticket_type_product_mappings (found), [4] ticket_types, [5] events,
    // [6] ghl_sync_state update (queued_for_sync), [7] ghl_sync_state update (last_error, null token)
    const client = makeSequentialClient([
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-1' }, error: null },
      { data: { name: 'General Admission' }, error: null },
      { data: { title: 'Test Conference 2026', slug: 'test-conf-2026' }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
    expect(json.registrationId).toBe('reg-uuid-123')

    expect(createRegistrationFromExternalPayment).toHaveBeenCalled()
    expect(ghlPut).not.toHaveBeenCalled()

    expect(client.from.mock.calls.length).toBe(8)
    const lastErrorArgs = client.from.mock.results[7].value.update.mock.calls[0][0]
    expect(lastErrorArgs).toEqual(expect.objectContaining({ last_error: 'no_ghl_access_token: org org-uuid-1' }))

    expect(consoleErr).toHaveBeenCalledWith(
      expect.stringContaining('no GHL access token for org org-uuid-1'),
      LIVE_PAYLOAD.contact_id,
    )
    consoleErr.mockRestore()
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
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', price_cents: priceCents, org_id: 'org-uuid-1' }, error: null },
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

    // 8, not 7: R56 adds the link-ready claim UPDATE inside the writeback,
    // which runs after the queued_for_sync update. Index 6 is unchanged — the
    // claim lands at index 7, after the assertion below reads index 6.
    expect(client.from.mock.calls.length).toBe(8)
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

    // 8, not 7: R56 adds the link-ready claim UPDATE inside the writeback,
    // which runs after the queued_for_sync update. Index 6 is unchanged — the
    // claim lands at index 7, after the assertion below reads index 6.
    expect(client.from.mock.calls.length).toBe(8)
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

    // 8, not 7: R56 adds the link-ready claim UPDATE inside the writeback,
    // which runs after the queued_for_sync update. Index 6 is unchanged — the
    // claim lands at index 7, after the assertion below reads index 6.
    expect(client.from.mock.calls.length).toBe(8)
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

describe('POST /api/ghl/webhooks/payment — appointment creation', () => {
  const EVENT_WITH_TIMES = {
    title: 'Test Conference 2026',
    slug: 'test-conf-2026',
    start_at: '2026-09-01T18:00:00Z',
    end_at: '2026-09-01T21:00:00Z',
    timezone: 'America/New_York',
  }

  // Call order matches the happy-path fixture: [0] ghl_sync_state select, [1] insert,
  // [2] ghl_location_links, [3] ticket_type_product_mappings, [4] ticket_types,
  // [5] events, [6] ghl_sync_state update (queued_for_sync), and only when an
  // appointment id comes back: [7] ghl_sync_state update (ghl_appointment_id).
  function baseResponses() {
    return [
      { data: null, error: null },
      { data: { id: 'state-new' }, error: null },
      { data: { org_id: 'org-uuid-1' }, error: null },
      { data: { ticket_type_id: 'tt-uuid-1', event_id: 'ev-uuid-1', org_id: 'org-uuid-1' }, error: null },
      { data: { name: 'General Admission' }, error: null },
      { data: EVENT_WITH_TIMES, error: null },
      { data: null, error: null },
    ]
  }

  it('calendarId present -> ghlPost called with the exact payload, ghl_appointment_id written', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')
    vi.mocked(getGhlOrgConfig).mockResolvedValueOnce({ ...SAUP_CONFIG, calendarId: 'cal-123' })
    vi.mocked(ghlPost).mockResolvedValueOnce({ id: 'appt-999' } as any)

    const client = makeSequentialClient([...baseResponses(), { data: null, error: null }])
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')

    expect(ghlPost).toHaveBeenCalledWith(
      'test-token',
      '/calendars/events/appointments',
      {
        calendarId: 'cal-123',
        locationId: LIVE_PAYLOAD.location.id,
        contactId: LIVE_PAYLOAD.contact_id,
        startTime: EVENT_WITH_TIMES.start_at,
        endTime: EVENT_WITH_TIMES.end_at,
        title: EVENT_WITH_TIMES.title,
        ignoreDateRange: true,
        ignoreFreeSlotValidation: true,
      },
    )

    // 10, not 9: the R55 Batch 2 idempotency guard adds a ghl_appointment_id
    // read before the POST, and R56 adds the link-ready claim UPDATE before that.
    // Index 9 (was 8) is the id write that follows.
    expect(client.from.mock.calls.length).toBe(10)
    const apptUpdateArgs = client.from.mock.results[9].value.update.mock.calls[0][0]
    expect(apptUpdateArgs).toEqual({ ghl_appointment_id: 'appt-999' })
  })

  it('calendarId null -> no appointment POST, registration flow unaffected', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')
    vi.mocked(getGhlOrgConfig).mockResolvedValueOnce({ ...SAUP_CONFIG, calendarId: null })

    const client = makeSequentialClient(baseResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')

    expect(ghlPost).not.toHaveBeenCalled()
    // 8, not 7: R56 adds the link-ready claim UPDATE inside the writeback,
    // which runs after the queued_for_sync update. Index 6 is unchanged — the
    // claim lands at index 7, after the assertion below reads index 6.
    expect(client.from.mock.calls.length).toBe(8)
  })

  it('appointment POST throws -> registration and sync status still succeed (non-fatal)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://prezva.app')
    vi.mocked(getGhlOrgConfig).mockResolvedValueOnce({ ...SAUP_CONFIG, calendarId: 'cal-123' })
    vi.mocked(ghlPost).mockRejectedValueOnce(new Error('GHL POST /calendars/events/appointments failed: 400'))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const client = makeSequentialClient(baseResponses())
    vi.mocked(createAdminClient).mockReturnValue(client as any)

    const res = await POST(makeRequest(CORRECT_SECRET))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('accepted')
    expect(json.registrationId).toBe('reg-uuid-123')

    // 9, not 8: the guard's ghl_appointment_id read runs before the POST that
    // throws, and R56's link-ready claim UPDATE runs before that guard.
    expect(client.from.mock.calls.length).toBe(9)
    expect(consoleErr).toHaveBeenCalledWith('ghl appointment create failed (non-fatal)', expect.any(Error))
    consoleErr.mockRestore()
  })
})

// ── R55: verification reorder ─────────────────────────────────────────────────

describe('R55 verification reorder', () => {
  it('parses the body first and hands the claimed location id to the verifier', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSequentialClient([{ data: { status: 'synced' }, error: null }]) as any,
    )

    await POST(makeRequest(CORRECT_SECRET))

    expect(verifyWebhookSecret).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: '4KrDX2FYA2XZ68q88rFS' }),
    )
  })

  it('passes an undefined location when the payload carries no location object', async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeSequentialClient([]) as any)
    const { location: _omitted, ...noLocation } = LIVE_PAYLOAD

    await POST(makeRequest(CORRECT_SECRET, noLocation))

    expect(verifyWebhookSecret).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ locationId: undefined }),
    )
  })

  // An unparseable body carries no location claim, so it cannot be verified
  // per-location — but it must still be authenticated before the route reveals
  // anything. Otherwise garbage from an unauthorized caller gets a 400 while a
  // bad secret gets a 401, which distinguishes the two for a prober.
  it('returns 401 (not 400) for an unparseable body from an unauthorized caller', async () => {
    const res = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        body: 'not json at all',
        headers: { 'content-type': 'application/json', 'X-Prezva-Webhook-Secret': 'wrong-secret' },
      }),
    )

    expect(res.status).toBe(401)
  })

  it('returns 400 invalid_json for an unparseable body from an authorized caller', async () => {
    const res = await POST(
      new NextRequest(BASE_URL, {
        method: 'POST',
        body: 'not json at all',
        headers: { 'content-type': 'application/json', 'X-Prezva-Webhook-Secret': CORRECT_SECRET },
      }),
    )

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_json' })
    // Verified with no options — there is no location claim to route on.
    expect(verifyWebhookSecret).toHaveBeenCalledWith(expect.anything())
  })
})
