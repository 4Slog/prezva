import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock requireUser ─────────────────────────────────────────────────────────
const mockRequireUser = vi.fn().mockResolvedValue({ id: 'user-1', email: 'paul@test.com' })
vi.mock('@/lib/auth/get-user', () => ({ requireUser: mockRequireUser }))

// ── Mock inviteMember (so route tests don't depend on inviteMember internals) ─
const mockInviteMember = vi.fn()
vi.mock('@/lib/orgs/actions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/orgs/actions')>('@/lib/orgs/actions')
  return { ...actual, inviteMember: mockInviteMember }
})

// ── Mock seedBuiltinRoles (tested separately; here we just need it to succeed) ─
vi.mock('@/lib/orgs/seed-builtin-roles', () => ({
  seedBuiltinRoles: vi.fn().mockResolvedValue('owner-role-uuid'),
}))

// ── Supabase mock factory ────────────────────────────────────────────────────
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockOrder = vi.fn()

function makeChain() {
  return {
    select: mockSelect.mockReturnThis(),
    insert: mockInsert.mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    delete: mockDelete.mockReturnThis(),
    eq: mockEq.mockReturnThis(),
    is: mockIs.mockReturnThis(),
    order: mockOrder.mockReturnThis(),
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
  }
}

const mockFrom = vi.fn(() => makeChain())

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

// Reset mocks before each test but keep requireUser working
beforeEach(() => {
  mockSingle.mockReset()
  mockMaybeSingle.mockReset()
  mockInsert.mockReset().mockReturnThis()
  mockUpdate.mockReset().mockReturnThis()
  mockDelete.mockReset().mockReturnThis()
  mockSelect.mockReset().mockReturnThis()
  mockEq.mockReset().mockReturnThis()
  mockIs.mockReset().mockReturnThis()
  mockOrder.mockReset().mockReturnThis()
  mockFrom.mockReset().mockImplementation(() => makeChain())
  mockRequireUser.mockResolvedValue({ id: 'user-1', email: 'paul@test.com' })
  mockInviteMember.mockReset()
})

// ── POST /api/orgs ────────────────────────────────────────────────────────────
describe('Orgs API — POST /api/orgs', () => {
  it('rejects missing name', async () => {
    const { POST } = await import('@/app/api/orgs/route')
    const req = new Request('http://localhost/api/orgs', {
      method: 'POST',
      body: JSON.stringify({ slug: 'test', timezone: 'UTC' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBeTruthy()
  })

  it('rejects invalid slug characters', async () => {
    const { POST } = await import('@/app/api/orgs/route')
    const req = new Request('http://localhost/api/orgs', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Org', slug: 'Test Org!', timezone: 'UTC' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })

  it('rejects duplicate slug — 409', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'existing-org' }, error: null })
    const { POST } = await import('@/app/api/orgs/route')
    const req = new Request('http://localhost/api/orgs', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Org', slug: 'test-org', timezone: 'UTC' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(409)
  })

  it('creates org and adds owner membership — 201', async () => {
    // Call 1: organizations.select().eq().maybeSingle() → slug check
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // Call 2: organizations.insert().select().single() → new org
    mockSingle.mockResolvedValueOnce({
      data: { id: 'org-1', name: 'Test Org', slug: 'test-org', timezone: 'UTC' },
      error: null,
    })
    // Call 3: org_members.insert() → just needs to resolve (no .single())
    // mockInsert already returns `this` (the chain), so the await on insert()
    // resolves with the chain — we need the second from() call's insert to resolve
    let callN = 0
    mockFrom.mockImplementation(() => {
      callN++
      if (callN === 3) {
        // org_members insert — awaited directly
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as unknown as ReturnType<typeof makeChain>
      }
      return makeChain()
    })

    const { POST } = await import('@/app/api/orgs/route')
    const req = new Request('http://localhost/api/orgs', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Org', slug: 'test-org', timezone: 'UTC' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(201)
  })
})

// ── PATCH /api/orgs/[id] ──────────────────────────────────────────────────────
describe('Orgs API — PATCH /api/orgs/[id]', () => {
  it('forbids non-member', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const { PATCH } = await import('@/app/api/orgs/[id]/route')
    const req = new Request('http://localhost/api/orgs/org-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(403)
  })

  it('forbids staff role', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'staff' }, error: null })
    const { PATCH } = await import('@/app/api/orgs/[id]/route')
    const req = new Request('http://localhost/api/orgs/org-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows admin to update — 200', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
    mockSingle.mockResolvedValueOnce({ data: { id: 'org-1', name: 'New Name' }, error: null })
    const { PATCH } = await import('@/app/api/orgs/[id]/route')
    const req = new Request('http://localhost/api/orgs/org-1', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
    })
    const res = await PATCH(req as Parameters<typeof PATCH>[0], {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(200)
  })
})

// ── POST /api/orgs/[id]/invite ────────────────────────────────────────────────
describe('Orgs API — POST /api/orgs/[id]/invite', () => {
  it('rejects invalid email', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    const { POST } = await import('@/app/api/orgs/[id]/invite/route')
    const req = new Request('http://localhost/api/orgs/org-1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email', role: 'staff' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('sends invite to non-Prezva user and returns 201', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    mockInviteMember.mockResolvedValueOnce({ success: true })
    const { POST } = await import('@/app/api/orgs/[id]/invite/route')
    const req = new Request('http://localhost/api/orgs/org-1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'ghost@example.com', role: 'staff' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(201)
  })

  it('returns 409 when already a member', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    mockInviteMember.mockResolvedValueOnce({ error: 'Already a member of this organization' })
    const { POST } = await import('@/app/api/orgs/[id]/invite/route')
    const req = new Request('http://localhost/api/orgs/org-1/invite', {
      method: 'POST',
      body: JSON.stringify({ email: 'member@example.com', role: 'staff' }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'org-1' }),
    })
    expect(res.status).toBe(409)
  })
})

// ── getUserOrgs action ────────────────────────────────────────────────────────
describe('getUserOrgs action', () => {
  it('returns empty array on error', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'fail' } })
    const { getUserOrgs } = await import('@/lib/orgs/actions')
    const result = await getUserOrgs()
    expect(result).toEqual([])
  })

  it('returns org list on success', async () => {
    const mockData = [
      {
        role: 'owner',
        accepted_at: new Date().toISOString(),
        organizations: { id: 'o1', name: 'Org 1', slug: 'org-1' },
      },
    ]
    mockOrder.mockResolvedValueOnce({ data: mockData, error: null })
    const { getUserOrgs } = await import('@/lib/orgs/actions')
    const result = await getUserOrgs()
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('owner')
  })
})
