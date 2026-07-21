// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

let mockData: { plan: string; entitled_until: string | null } | null = null

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(async () => ({ data: mockData, error: null })),
    }),
  })),
}))

import { isOrgEntitled, requireEntitlement } from '@/lib/entitlements'

describe('isOrgEntitled', () => {
  it('returns false for plan=free (the default)', async () => {
    mockData = { plan: 'free', entitled_until: null }
    expect(await isOrgEntitled('org-1')).toBe(false)
  })

  it('returns true for a non-free plan with no entitled_until (no expiry)', async () => {
    mockData = { plan: 'paid', entitled_until: null }
    expect(await isOrgEntitled('org-1')).toBe(true)
  })

  it('returns true for a non-free plan with entitled_until in the future', async () => {
    mockData = { plan: 'paid', entitled_until: new Date(Date.now() + 60_000).toISOString() }
    expect(await isOrgEntitled('org-1')).toBe(true)
  })

  it('returns false for a non-free plan with entitled_until in the past (expired)', async () => {
    mockData = { plan: 'paid', entitled_until: new Date(Date.now() - 60_000).toISOString() }
    expect(await isOrgEntitled('org-1')).toBe(false)
  })

  it('returns false when the org row is not found (fail closed)', async () => {
    mockData = null
    expect(await isOrgEntitled('org-1')).toBe(false)
  })
})

describe('requireEntitlement', () => {
  it('returns null when the org is entitled', async () => {
    mockData = { plan: 'paid', entitled_until: null }
    expect(await requireEntitlement('org-1')).toBeNull()
  })

  it('returns the typed entitlement_required error when not entitled', async () => {
    mockData = { plan: 'free', entitled_until: null }
    expect(await requireEntitlement('org-1')).toEqual({ error: 'entitlement_required' })
  })
})
