// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { POST } from './route'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BASE_URL = 'http://localhost/api/e/test-event/sessions/sess-uuid-1/watch'

function makeRequest(body: object, contentType = 'application/json') {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': contentType },
  })
}

// Builds a minimal Supabase chain mock where .maybeSingle() resolves to resp
function chain(resp: { data: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'maybeSingle', 'rpc']) {
    c[k] = vi.fn()
  }
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.maybeSingle = vi.fn().mockResolvedValue(resp)
  return c
}

const SESSION_ROW = {
  id: 'sess-uuid-1',
  event_id: 'ev-uuid-1',
  starts_at: '2026-07-13T18:00:00Z',
  ends_at: '2026-07-13T19:00:00Z', // 3600s duration
  is_published: true,
}

const REG_ROW = { id: 'reg-uuid-1' }

beforeEach(() => {
  vi.resetAllMocks()
})

// ── Auth ─────────────────────────────────────────────────────────────────────

describe('POST /api/e/[slug]/sessions/[sessionId]/watch — auth', () => {
  it('returns 401 when no authenticated user', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)

    const res = await POST(
      makeRequest({ watchedSeconds: 100 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })
})

// ── Session lookup ────────────────────────────────────────────────────────────

describe('POST /api/e/[slug]/sessions/[sessionId]/watch — session lookup', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-uuid-1' } } }) },
    } as any)
  })

  it('returns 404 when session does not exist', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chain({ data: null })),
      rpc: vi.fn(),
    } as any)

    const res = await POST(
      makeRequest({ watchedSeconds: 100 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when session is unpublished', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chain({ data: { ...SESSION_ROW, is_published: false } })),
      rpc: vi.fn(),
    } as any)

    const res = await POST(
      makeRequest({ watchedSeconds: 100 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(404)
  })
})

// ── Registration lookup ───────────────────────────────────────────────────────

describe('POST /api/e/[slug]/sessions/[sessionId]/watch — registration', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-uuid-1' } } }) },
    } as any)
  })

  it('returns 403 when user has no confirmed registration', async () => {
    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        // first call = session lookup (found), second = reg lookup (null)
        return chain({ data: callCount === 1 ? SESSION_ROW : null })
      }),
      rpc: vi.fn(),
    } as any)

    const res = await POST(
      makeRequest({ watchedSeconds: 100 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('No confirmed registration')
  })
})

// ── watchedSeconds clamping ───────────────────────────────────────────────────

describe('POST /api/e/[slug]/sessions/[sessionId]/watch — clamp + guard', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-uuid-1' } } }) },
    } as any)
  })

  function makeHappyAdmin(rpcResult: { error: null | { message: string } } = { error: null }) {
    let callCount = 0
    const rpcMock = vi.fn().mockResolvedValue(rpcResult)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        return chain({ data: callCount === 1 ? SESSION_ROW : REG_ROW })
      }),
      rpc: rpcMock,
    } as any)
    return rpcMock
  }

  it('(a) inserts a virtual row — calls rpc with positive clamped watched seconds', async () => {
    const rpcMock = makeHappyAdmin()

    const res = await POST(
      makeRequest({ watchedSeconds: 1800 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('record_virtual_watch', {
      p_session_id: 'sess-uuid-1',
      p_registration_id: 'reg-uuid-1',
      p_event_id: 'ev-uuid-1',
      p_watched: 1800,
    })
  })

  it('(b) guard: watchedSeconds 0 still calls rpc (SQL WHERE guard handles in-person NO-OP)', async () => {
    // The WHERE guard lives in the SQL function. Client side we clamp to 0 minimum and
    // always call rpc — the DB function decides whether to update based on existing row state.
    const rpcMock = makeHappyAdmin()

    const res = await POST(
      makeRequest({ watchedSeconds: 0 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('record_virtual_watch', expect.objectContaining({ p_watched: 0 }))
  })

  it('(c) virtual-over-virtual GREATEST: clamps to session duration, passes full value', async () => {
    // Client sends TOTAL watched; server calls GREATEST(incoming, existing) in SQL.
    // If client sends more than session duration, we clamp to session duration (3600s).
    const rpcMock = makeHappyAdmin()

    const res = await POST(
      makeRequest({ watchedSeconds: 9999 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(200)
    // SESSION_ROW duration = 3600s → clamped to 3600
    expect(rpcMock).toHaveBeenCalledWith('record_virtual_watch', expect.objectContaining({ p_watched: 3600 }))
  })

  it('clamps negative / NaN watchedSeconds to 0', async () => {
    const rpcMock = makeHappyAdmin()

    const res = await POST(
      makeRequest({ watchedSeconds: -500 }),
      { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) },
    )
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('record_virtual_watch', expect.objectContaining({ p_watched: 0 }))
  })

  it('parses text/plain body (sendBeacon default content-type)', async () => {
    const rpcMock = makeHappyAdmin()

    const req = new NextRequest(BASE_URL, {
      method: 'POST',
      body: JSON.stringify({ watchedSeconds: 500 }),
      headers: { 'content-type': 'text/plain' },
    })
    const res = await POST(req, { params: Promise.resolve({ slug: 'test-event', sessionId: 'sess-uuid-1' }) })
    expect(res.status).toBe(200)
    expect(rpcMock).toHaveBeenCalledWith('record_virtual_watch', expect.objectContaining({ p_watched: 500 }))
  })
})
