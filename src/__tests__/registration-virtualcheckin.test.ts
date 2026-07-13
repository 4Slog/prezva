import { describe, it, expect, vi } from 'vitest'

// registration/actions.ts pulls in Stripe checkout + Trigger.dev + rate-limit
// modules that throw at import time without env vars in a test process —
// none of them are exercised by virtualCheckIn, so stub them out.
vi.mock('@/lib/stripe/checkout', () => ({ createCheckoutSession: vi.fn() }))
vi.mock('@/lib/trigger', () => ({ enqueueConfirmationEmail: vi.fn() }))
vi.mock('@/lib/integrations/_shared/association-verify', () => ({ verifyMembership: vi.fn() }))
vi.mock('@/lib/ratelimit', () => ({ checkRateLimit: vi.fn(), registrationLimiter: {} }))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { virtualCheckIn } from '@/lib/registration/actions'

const REG_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

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

describe('virtualCheckIn', () => {
  it('returns error for refunded registration', async () => {
    const refundedReg = { id: REG_ID, event_id: 'event-1', status: 'refunded', delivery_method: 'virtual' }
    mockFromImpl = (t) => {
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: refundedReg, error: null }) })
      return makeChain()
    }
    const result = await virtualCheckIn(REG_ID)
    expect((result as any).error).toContain('refunded')
  })

  it('returns error for cancelled registration', async () => {
    const cancelledReg = { id: REG_ID, event_id: 'event-1', status: 'cancelled', delivery_method: 'virtual' }
    mockFromImpl = (t) => {
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: cancelledReg, error: null }) })
      return makeChain()
    }
    const result = await virtualCheckIn(REG_ID)
    expect((result as any).error).toContain('cancelled')
  })
})
