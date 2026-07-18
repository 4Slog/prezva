import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeFakeAdmin, type Recorded } from './fake-supabase'

vi.mock('@trigger.dev/sdk', () => ({
  schemaTask: (opts: any) => opts,
}))

vi.mock('../../lib/supabase-admin', () => ({
  createAdminClient: vi.fn(),
}))

const ghlLocationMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/integrations/ghl/location', () => ({
  ghlLocationIdForOrg: ghlLocationMock,
}))

import { processWaitlist } from '../registration'
import { createAdminClient } from '../../lib/supabase-admin'

// schemaTask is mocked to identity above, so at runtime processWaitlist is the
// raw opts object with a callable .run — but its real (unmocked) type is
// TaskWithSchema, which doesn't expose .run for direct invocation. Cast through
// this narrow shape rather than `as any` at every call site.
type Payload = { eventId: string; eventTitle: string; eventSlug?: string }
const runProcessWaitlist = (payload: Payload) =>
  (processWaitlist as unknown as { run: (p: Payload) => Promise<any> }).run(payload)

const EVENT_ID = 'event-1'
const ORG_ID = 'org-1'

function nextWaitlistedReg(overrides: Record<string, any> = {}) {
  return {
    id: 'reg-wl-1',
    attendee_email: 'jane@example.com',
    attendee_name: 'Jane Doe',
    qr_code: 'QR-123',
    waitlist_position: 1,
    user_id: null,
    ...overrides,
  }
}

function buildResolver(cfg: { event: { org_id: string } | null; nextReg?: any }) {
  return (call: Recorded) => {
    if (call.table === 'events') return { data: cfg.event, error: null }
    if (call.table === 'registrations') {
      if (call.mode === 'select') return { data: cfg.nextReg ?? null, error: null }
      if (call.mode === 'update') return { data: null, error: null }
    }
    throw new Error(`unexpected table in test: ${call.table}`)
  }
}

describe('processWaitlist', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-resend-key'
    fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    ghlLocationMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('skips promotion and email on a GHL-linked event — GHL owns the waitlist lane (R31)', async () => {
    ghlLocationMock.mockResolvedValue('ghl-loc-1')
    const { admin, calls } = makeFakeAdmin(
      buildResolver({ event: { org_id: ORG_ID } }),
    )
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    const result = await runProcessWaitlist({ eventId: EVENT_ID, eventTitle: 'SAUP Conf' })

    expect(result).toEqual({ processed: false, reason: 'ghl-linked event — GHL owns waitlist lane' })
    expect(ghlLocationMock).toHaveBeenCalledWith(admin, ORG_ID)
    expect(calls.some((c) => c.table === 'registrations' && c.mode === 'update')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('promotes exactly one waitlisted registration and emails on a standalone (non-GHL) event', async () => {
    ghlLocationMock.mockResolvedValue(null)
    const nextReg = nextWaitlistedReg()
    const { admin, calls } = makeFakeAdmin(
      buildResolver({ event: { org_id: ORG_ID }, nextReg }),
    )
    vi.mocked(createAdminClient).mockReturnValue(admin as any)

    const result = await runProcessWaitlist({
      eventId: EVENT_ID,
      eventTitle: 'Standalone Conf',
      eventSlug: 'standalone-conf',
    })

    expect(result).toEqual({ processed: true, promotedId: nextReg.id, sentTo: nextReg.attendee_email })
    expect(
      calls.some(
        (c) => c.table === 'registrations' && c.mode === 'update' && c.payload?.status === 'confirmed',
      ),
    ).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
