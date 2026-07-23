import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRequireAdmin = vi.fn().mockResolvedValue('admin@test.com')
vi.mock('@/lib/admin/gate', () => ({ requireAdmin: mockRequireAdmin }))

const mockSingle = vi.fn()
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockInviteUserByEmail = vi.fn()

function makeChain() {
  return {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    single: mockSingle,
  }
}

const mockFrom = vi.fn(() => makeChain())
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
    auth: { admin: { inviteUserByEmail: mockInviteUserByEmail } },
  })),
}))

beforeEach(() => {
  mockRequireAdmin.mockReset().mockResolvedValue('admin@test.com')
  mockSingle.mockReset()
  mockInsert.mockReset().mockReturnThis()
  mockSelect.mockReset().mockReturnThis()
  mockEq.mockReset().mockReturnThis()
  mockFrom.mockReset().mockImplementation(() => makeChain())
  mockInviteUserByEmail.mockReset().mockResolvedValue({ error: null })
})

describe('Admin onboarding — POST /api/admin/users/onboard', () => {
  it('400s when timezone is missing — no default is applied', async () => {
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/admin/users/onboard', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new@test.com',
        fullName: 'New User',
        orgName: 'New Org',
        orgSlug: 'new-org',
        // timezone omitted on purpose
      }),
    })
    const res = await POST(req as unknown as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
    // Org creation never happens on a validation failure.
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('creates the org with the submitted timezone — 200', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: null, error: null })                       // slug uniqueness — free
      .mockResolvedValueOnce({ data: { id: 'org-1' }, error: null })            // org insert result
    const { POST } = await import('./route')
    const req = new Request('http://localhost/api/admin/users/onboard', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new@test.com',
        fullName: 'New User',
        orgName: 'New Org',
        orgSlug: 'new-org',
        timezone: 'America/Denver',
      }),
    })
    const res = await POST(req as unknown as Parameters<typeof POST>[0])
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Org', slug: 'new-org', timezone: 'America/Denver' }),
    )
  })
})
