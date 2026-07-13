import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { selfCheckInByToken } from '@/lib/checkin/self-checkin-actions'

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'eq', 'is']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.maybeSingle = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'insert', 'eq', 'is']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

const TOKEN = 'PREZVA-123456-ABC123'

describe('selfCheckInByToken', () => {
  it('returns error for refunded registration', async () => {
    const refundedReg = {
      id: 'reg-1', user_id: null, attendee_name: 'Alice', attendee_email: 'alice@test.com',
      status: 'refunded', event_id: 'event-1',
      events: { id: 'event-1', title: 'Test Event', start_at: new Date().toISOString(), timezone: 'UTC', slug: 'test-event' },
    }
    mockFromImpl = (t) => {
      if (t === 'registrations') return makeChain({ maybeSingle: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
      return makeChain()
    }
    const result = await selfCheckInByToken(TOKEN)
    expect(result.success).toBe(false)
    expect(result.error).toContain('refunded')
  })
})
