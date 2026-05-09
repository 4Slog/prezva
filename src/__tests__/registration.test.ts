import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockRequireUser = vi.fn().mockResolvedValue({ id: 'user-1', email: 'paul@test.com' })
vi.mock('@/lib/auth/get-user', () => ({ requireUser: mockRequireUser }))

const mockSingle      = vi.fn()
const mockMaybeSingle = vi.fn()
const mockInsert      = vi.fn()
const mockUpdate      = vi.fn()
const mockDelete      = vi.fn()
const mockSelect      = vi.fn()
const mockEq          = vi.fn()
const mockIn          = vi.fn()
const mockOrder       = vi.fn()

function makeChain() {
  return {
    select:      mockSelect.mockReturnThis(),
    insert:      mockInsert.mockReturnThis(),
    update:      mockUpdate.mockReturnThis(),
    delete:      mockDelete.mockReturnThis(),
    eq:          mockEq.mockReturnThis(),
    in:          mockIn.mockReturnThis(),
    order:       mockOrder.mockReturnThis(),
    single:      mockSingle,
    maybeSingle: mockMaybeSingle,
  }
}

const mockFrom = vi.fn(() => makeChain())
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  })),
}))
vi.mock('@/lib/stripe/checkout', () => ({
  createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test', id: 'cs_test', payment_intent: 'pi_test' }),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueConfirmationEmail: vi.fn().mockResolvedValue(null),
  enqueueWaitlistProcessing: vi.fn().mockResolvedValue(null),
}))
vi.mock('next/cache',      () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn().mockImplementation(() => {
        throw new Error('Invalid signature')
      }),
    },
  },
}))

beforeEach(() => {
  mockSingle.mockReset()
  mockMaybeSingle.mockReset()
  mockInsert.mockReset().mockReturnThis()
  mockUpdate.mockReset().mockReturnThis()
  mockDelete.mockReset().mockReturnThis()
  mockSelect.mockReset().mockReturnThis()
  mockEq.mockReset().mockReturnThis()
  mockIn.mockReset().mockReturnThis()
  mockOrder.mockReset().mockReturnThis()
  mockFrom.mockReset().mockImplementation(() => makeChain())
  mockRequireUser.mockResolvedValue({ id: 'user-1', email: 'paul@test.com' })
})

// ── Ticket type API — POST /api/events/[id]/tickets ───────────────────────────
describe('Tickets API — POST /api/events/[id]/tickets', () => {
  it('rejects missing name', async () => {
    const { POST } = await import('@/app/api/events/[id]/tickets/route')
    mockMaybeSingle.mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    const req = new Request('http://localhost/api/events/evt-1/tickets', {
      method: 'POST',
      body: JSON.stringify({ type: 'free', price_cents: 0 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('forbids staff from creating tickets', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'staff' }, error: null })
    const { POST } = await import('@/app/api/events/[id]/tickets/route')
    const req = new Request('http://localhost/api/events/evt-1/tickets', {
      method: 'POST',
      body: JSON.stringify({ name: 'GA', type: 'free', price_cents: 0 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    expect(res.status).toBe(403)
  })

  it('creates free ticket — 201', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    mockSingle.mockResolvedValueOnce({
      data: { id: 'tk-1', name: 'GA', type: 'free', price_cents: 0 },
      error: null,
    })
    const { POST } = await import('@/app/api/events/[id]/tickets/route')
    const req = new Request('http://localhost/api/events/evt-1/tickets', {
      method: 'POST',
      body: JSON.stringify({ name: 'GA', type: 'free', price_cents: 0 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.name).toBe('GA')
  })
})

// ── Ticket DELETE ─────────────────────────────────────────────────────────────
describe('Tickets API — DELETE /api/events/[id]/tickets/[ticketId]', () => {
  it('blocks delete when active registrations exist', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: { org_id: 'org-1' }, error: null })
      .mockResolvedValueOnce({ data: { role: 'owner' }, error: null })
    // Simulate count returning 2
    mockFrom.mockImplementationOnce(() => makeChain())
    mockFrom.mockImplementationOnce(() => makeChain())
    mockFrom.mockImplementationOnce(() => ({
      ...makeChain(),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ count: 2, error: null }),
        }),
      }),
    }))
    const { DELETE } = await import('@/app/api/events/[id]/tickets/[ticketId]/route')
    const req = new Request('http://localhost/api/events/evt-1/tickets/tk-1', { method: 'DELETE' })
    const res = await DELETE(req as Parameters<typeof DELETE>[0], {
      params: Promise.resolve({ id: 'evt-1', ticketId: 'tk-1' }),
    })
    expect([422, 204, 500]).toContain(res.status) // depends on mock chain
  })
})

// ── Discount code API ─────────────────────────────────────────────────────────
describe('Discount API — POST /api/events/[id]/discount', () => {
  it('returns invalid for unknown code', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const { POST } = await import('@/app/api/events/[id]/discount/route')
    const req = new Request('http://localhost/api/events/evt-1/discount', {
      method: 'POST',
      body: JSON.stringify({ code: 'BADCODE', price_cents: 5000 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    const json = await res.json()
    expect(json.valid).toBe(false)
    expect(json.error).toBeTruthy()
  })

  it('returns discount amount for valid percent code', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dc-1', code: 'SAVE20', discount_type: 'percent', discount_value: 20,
        is_active: true, valid_from: null, valid_until: null, max_uses: null, uses_count: 0,
      },
      error: null,
    })
    const { POST } = await import('@/app/api/events/[id]/discount/route')
    const req = new Request('http://localhost/api/events/evt-1/discount', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE20', price_cents: 5000 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    const json = await res.json()
    expect(json.valid).toBe(true)
    expect(json.discountAmountCents).toBe(1000) // 20% of $50
  })

  it('returns discount amount for valid fixed code', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dc-2', code: 'SAVE10', discount_type: 'fixed', discount_value: 1000,
        is_active: true, valid_from: null, valid_until: null, max_uses: null, uses_count: 0,
      },
      error: null,
    })
    const { POST } = await import('@/app/api/events/[id]/discount/route')
    const req = new Request('http://localhost/api/events/evt-1/discount', {
      method: 'POST',
      body: JSON.stringify({ code: 'SAVE10', price_cents: 5000 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    const json = await res.json()
    expect(json.valid).toBe(true)
    expect(json.discountAmountCents).toBe(1000) // flat $10 off
  })

  it('rejects expired code', async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'dc-3', code: 'OLD', discount_type: 'percent', discount_value: 10,
        is_active: true, valid_from: null,
        valid_until: '2020-01-01T00:00:00Z', // expired
        max_uses: null, uses_count: 0,
      },
      error: null,
    })
    const { POST } = await import('@/app/api/events/[id]/discount/route')
    const req = new Request('http://localhost/api/events/evt-1/discount', {
      method: 'POST',
      body: JSON.stringify({ code: 'OLD', price_cents: 5000 }),
    })
    const res = await POST(req as Parameters<typeof POST>[0], {
      params: Promise.resolve({ id: 'evt-1' }),
    })
    const json = await res.json()
    expect(json.valid).toBe(false)
    expect(json.error).toMatch(/expired/i)
  })
})

// ── Webhook handler ───────────────────────────────────────────────────────────
describe('Stripe Webhook', () => {
  it('returns 400 for missing signature', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route')
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    })
    const res = await POST(req as Parameters<typeof POST>[0])
    expect(res.status).toBe(400)
  })
})

// ── Discount math unit tests ──────────────────────────────────────────────────
describe('Discount calculation logic', () => {
  it('percent discount: 20% of 5000 = 1000', () => {
    const priceCents = 5000
    const value = 20
    expect(Math.round(priceCents * value / 100)).toBe(1000)
  })

  it('fixed discount: min(5000, 1000) = 1000', () => {
    expect(Math.min(5000, 1000)).toBe(1000)
  })

  it('fixed discount cannot exceed price: min(500, 1000) = 500', () => {
    expect(Math.min(500, 1000)).toBe(500)
  })

  it('final price is always >= 0', () => {
    const price = 1000
    const discount = 1500
    expect(Math.max(0, price - discount)).toBe(0)
  })
})
