import { describe, it, expect, vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'fake-embed-token' }) }),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn().mockResolvedValue({ location_id: 'loc_1' }),
  COOKIE_NAME: 'embed_session',
}))
vi.mock('@/lib/trigger', () => ({
  enqueueGhlStageMove: vi.fn().mockResolvedValue(null),
}))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { checkInByQR, checkInBySearch, processOfflineQueue } from '@/lib/embedded/checkin-actions'

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG_ID   = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG_ID   = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const QR_CODE  = 'PREZVA-123456-ABC123'

const mockLink  = { org_id: ORG_ID }
const mockEvent = { id: EVENT_ID, org_id: ORG_ID }

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'eq', 'is']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.single = vi.fn()
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'insert', 'eq', 'is']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

function setupRefundedReg() {
  const refundedReg = {
    id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com',
    status: 'refunded', ticket_types: { name: 'General' },
  }
  mockFromImpl = (t) => {
    if (t === 'ghl_location_links') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockLink, error: null }) })
    if (t === 'events') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
    if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
    return makeChain()
  }
}

describe('embedded checkInByQR', () => {
  it('returns error for refunded registration', async () => {
    setupRefundedReg()
    const result = await checkInByQR(EVENT_ID, QR_CODE)
    expect(result.success).toBe(false)
    expect(result.error).toContain('refunded')
  })
})

describe('embedded checkInBySearch', () => {
  it('returns error for refunded registration', async () => {
    setupRefundedReg()
    const result = await checkInBySearch(EVENT_ID, REG_ID)
    expect(result.success).toBe(false)
    expect(result.error).toContain('refunded')
  })
})

describe('embedded processOfflineQueue (checkInByQRInternal)', () => {
  it('rejects a refunded entry in the offline batch', async () => {
    const refundedReg = {
      id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com',
      status: 'refunded', ticket_types: { name: 'General' },
    }
    mockFromImpl = (t) => {
      if (t === 'ghl_location_links') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockLink, error: null }) })
      if (t === 'events') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: EVENT_ID }, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
      return makeChain()
    }
    const result = await processOfflineQueue({
      eventId: EVENT_ID,
      deviceId: 'scanner-1',
      entries: [{ qr_code: QR_CODE, scanned_at: new Date().toISOString() }],
    })
    expect((result as any).processed).toBe(0)
    expect((result as any).failedQrCodes).toEqual([QR_CODE])
    expect((result as any).errors[0]).toContain('refunded')
  })
})
