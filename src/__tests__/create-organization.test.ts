import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAdminClient } from '@/lib/supabase/admin'
import { seedBuiltinRoles } from '@/lib/orgs/seed-builtin-roles'
import { logAudit } from '@/lib/audit/log'
import { createOrganization } from '@/lib/orgs/create-organization'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/orgs/seed-builtin-roles', () => ({ seedBuiltinRoles: vi.fn() }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }))

// Builds a thenable chain where every method returns `this` and terminal
// methods (.single / .maybeSingle) plus direct-await resolve to `resolvedValue`.
function makeChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> & { then: (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => Promise<unknown> } = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolvedValue),
    maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolvedValue).then(onFulfilled, onRejected)
    },
  }
  return chain
}

const MOCK_ORG = {
  id: 'org-1', name: 'Test Org', slug: 'test-slug', timezone: 'UTC',
  created_by: 'user-1', created_at: '2026-01-01T00:00:00Z',
}
const BASE_INPUT = {
  userId: 'user-1', userEmail: 'paul@test.com',
  name: 'Test Org', slug: 'test-slug', timezone: 'UTC',
}

describe('createOrganization', () => {
  let mockFrom: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFrom = vi.fn()
    vi.mocked(createAdminClient).mockReturnValue(
      { from: mockFrom } as unknown as ReturnType<typeof createAdminClient>,
    )
    vi.mocked(seedBuiltinRoles).mockResolvedValue('owner-role-id')
    vi.mocked(logAudit).mockResolvedValue(undefined)
  })

  it('returns ok:true for existing owner (ownerCount=1) with free slug', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))          // slug check → free
      .mockReturnValueOnce(makeChain({ count: 1 }))                          // owner count → exempt
      .mockReturnValueOnce(makeChain({ data: MOCK_ORG, error: null }))      // org insert
      .mockReturnValueOnce(makeChain({ error: null }))                       // member insert

    const result = await createOrganization(BASE_INPUT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.org).toMatchObject({ id: 'org-1' })
  })

  it('returns 403 when first org and no invite code provided', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))  // slug check
      .mockReturnValueOnce(makeChain({ count: 0 }))                  // owner count → first org

    const result = await createOrganization({ ...BASE_INPUT, inviteCode: null })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toMatch(/invite code is required/)
    }
  })

  it('returns 403 when invite code not found', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))  // slug check
      .mockReturnValueOnce(makeChain({ count: 0 }))                  // owner count
      .mockReturnValueOnce(makeChain({ data: null, error: null }))  // pre-read → not found

    const result = await createOrganization({ ...BASE_INPUT, inviteCode: 'BAD-CODE' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toMatch(/Invalid invite code/)
    }
  })

  it('returns 403 when invite code already used', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ count: 0 }))
      .mockReturnValueOnce(makeChain({
        data: { id: 'inv-1', email: null, used_at: '2026-01-01T00:00:00Z' }, error: null,
      }))

    const result = await createOrganization({ ...BASE_INPUT, inviteCode: 'USED-CODE' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toMatch(/already been used/)
    }
  })

  it('claims invite atomically and returns ok:true for valid unused code', async () => {
    const claimUpdate = vi.fn().mockReturnThis()
    const claimChain = {
      update: claimUpdate,
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'inv-1' }, error: null }),
    }

    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ count: 0 }))
      .mockReturnValueOnce(makeChain({ data: { id: 'inv-1', email: null, used_at: null }, error: null }))
      .mockReturnValueOnce(claimChain)
      .mockReturnValueOnce(makeChain({ data: MOCK_ORG, error: null }))
      .mockReturnValueOnce(makeChain({ error: null }))

    const result = await createOrganization({ ...BASE_INPUT, inviteCode: 'GOOD-CODE' })
    expect(result.ok).toBe(true)
    expect(claimUpdate).toHaveBeenCalledWith(expect.objectContaining({
      used_at: expect.any(String),
      used_by: 'user-1',
    }))
  })

  it('returns 403 when atomic claim is lost to a race (claimed returns null)', async () => {
    const claimChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ count: 0 }))
      .mockReturnValueOnce(makeChain({ data: { id: 'inv-1', email: null, used_at: null }, error: null }))
      .mockReturnValueOnce(claimChain)

    const result = await createOrganization({ ...BASE_INPUT, inviteCode: 'RACED-CODE' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(403)
      expect(result.error).toMatch(/no longer available/)
    }
  })

  it('returns 409 with field:slug when slug is already taken', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { id: 'existing' }, error: null }))  // slug taken

    const result = await createOrganization(BASE_INPUT)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(409)
      expect(result.field).toBe('slug')
    }
  })

  it('returns 500 and releases claimed invite code when seedBuiltinRoles throws', async () => {
    vi.mocked(seedBuiltinRoles).mockRejectedValueOnce(new Error('DB error'))

    const releaseUpdate = vi.fn().mockReturnThis()
    const releaseChain = {
      update: releaseUpdate,
      eq: vi.fn().mockReturnThis(),
      then(onFulfilled: (v: unknown) => unknown) {
        return Promise.resolve({ error: null }).then(onFulfilled)
      },
    }
    const claimChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'inv-1' }, error: null }),
    }

    mockFrom
      .mockReturnValueOnce(makeChain({ data: null, error: null }))
      .mockReturnValueOnce(makeChain({ count: 0 }))
      .mockReturnValueOnce(makeChain({ data: { id: 'inv-1', email: null, used_at: null }, error: null }))
      .mockReturnValueOnce(claimChain)
      .mockReturnValueOnce(makeChain({ data: MOCK_ORG, error: null }))
      .mockReturnValueOnce(releaseChain)

    const result = await createOrganization({ ...BASE_INPUT, inviteCode: 'GOOD-CODE' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.status).toBe(500)
      expect(result.error).toMatch(/role setup failed/)
    }
    expect(releaseUpdate).toHaveBeenCalledWith({ used_at: null, used_by: null })
  })
})
