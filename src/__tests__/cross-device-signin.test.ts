import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const SRC = join(process.cwd(), 'src')

describe('Cross-device sign-in (GE-6/I10) — file structure', () => {
  it('auth confirm route exists', () => {
    expect(existsSync(join(SRC, 'app/auth/confirm/route.ts'))).toBe(true)
  })

  it('event app-access route exists', () => {
    expect(existsSync(join(SRC, 'app/e/[slug]/app-access/route.ts'))).toBe(true)
  })
})

describe('Cross-device sign-in (GE-6/I10) — content checks', () => {
  it('auth confirm route verifies the OTP token hash and falls back on failure', () => {
    const content = readFileSync(join(SRC, 'app/auth/confirm/route.ts'), 'utf-8')
    expect(content).toContain('verifyOtp')
    expect(content).toContain('auth_callback_failed')
  })

  it('app-access route mints a magic link and hands off to /auth/confirm', () => {
    const content = readFileSync(join(SRC, 'app/e/[slug]/app-access/route.ts'), 'utf-8')
    expect(content).toContain('app_access_token')
    expect(content).toContain('generateLink')
    expect(content).toContain('/auth/confirm')
  })
})

// registration/actions.ts pulls in Stripe checkout + Trigger.dev + rate-limit
// modules that throw at import time without env vars in a test process —
// none of them are exercised by createRegistrationFromExternalPayment, so stub them out.
vi.mock('@/lib/stripe/checkout', () => ({ createCheckoutSession: vi.fn() }))
vi.mock('@/lib/trigger', () => ({ enqueueConfirmationEmail: vi.fn() }))
vi.mock('@/lib/integrations/_shared/association-verify', () => ({ verifyMembership: vi.fn() }))
vi.mock('@/lib/ratelimit', () => ({ checkRateLimit: vi.fn(), registrationLimiter: {} }))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { createRegistrationFromExternalPayment } from '@/lib/registration/actions'

describe('createRegistrationFromExternalPayment — appAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the row appAccessToken on new registration', async () => {
    mockFromImpl = () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({
        data: { id: 'reg-1', qr_code: 'QR123', app_access_token: 'tok-abc' },
        error: null,
      }),
    })

    const result = await createRegistrationFromExternalPayment({
      eventId: 'event-1',
      ticketTypeId: 'tt-1',
      attendeeEmail: 'alice@test.com',
      attendeeName: 'Alice',
      amountPaidCents: 1000,
      externalSource: 'ghl_payment',
      externalOrderId: 'order-1',
      paymentGateway: 'ghl',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.appAccessToken).toBe('tok-abc')
    }
  })

  it('returns the existing row appAccessToken on idempotent replay', async () => {
    mockFromImpl = () => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'reg-1', qr_code: 'QR123', app_access_token: 'tok-existing' },
      }),
      single: vi.fn(),
    })

    const result = await createRegistrationFromExternalPayment({
      eventId: 'event-1',
      ticketTypeId: 'tt-1',
      attendeeEmail: 'alice@test.com',
      attendeeName: 'Alice',
      amountPaidCents: 1000,
      externalSource: 'ghl_payment',
      externalOrderId: 'order-1',
      paymentGateway: 'ghl',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.appAccessToken).toBe('tok-existing')
    }
  })
})
