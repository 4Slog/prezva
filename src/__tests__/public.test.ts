import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getPublicEvent, getPublicAgenda, getPublicSpeakers, getBookmarks } from '@/lib/public/actions'
import { toggleBookmark } from '@/lib/public/bookmark-actions'

// A chainable mock where every method returns the chain AND
// the chain itself is a Promise (resolves to { data, error })
function makeChain(defaultData: any = null) {
  let resolveData = defaultData
  let resolveError: any = null

  const chain: any = {
    then: (res: any, rej: any) => Promise.resolve({ data: resolveData, error: resolveError }).then(res, rej),
    catch: (fn: any) => Promise.resolve({ data: resolveData, error: resolveError }).catch(fn),
    _setData: (d: any, e: any = null) => { resolveData = d; resolveError = e; return chain },
  }
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockImplementation(() => ({ data: resolveData, error: resolveError }))
  chain.single = vi.fn().mockImplementation(() => Promise.resolve({ data: resolveData, error: resolveError }))
  chain.maybeSingle = vi.fn().mockImplementation(() => Promise.resolve({ data: resolveData, error: resolveError }))
  chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
  chain.delete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) })
  return chain
}

describe('Public Actions', () => {
  let mockSupabase: any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setup(data: any, error: any = null) {
    const chain = makeChain(data)
    chain._setData(data, error)
    mockSupabase = {
      from: vi.fn().mockReturnValue(chain),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    }
    ;(createClient as any).mockResolvedValue(mockSupabase)
    return chain
  }

  it('getPublicEvent returns event when found', async () => {
    const evt = { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', title: 'Test' }
    const chain = setup(evt)
    chain.single.mockResolvedValueOnce({ data: evt, error: null })
    expect(await getPublicEvent('test-slug')).toEqual(evt)
  })

  it('getPublicEvent returns null when not found', async () => {
    const chain = setup(null, { message: 'not found' })
    chain.single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    expect(await getPublicEvent('missing')).toBeNull()
  })

  it('getPublicAgenda returns sessions', async () => {
    const sessions = [{ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', title: 'Keynote' }]
    const chain = setup(sessions)
    chain.order.mockReturnValueOnce({ data: sessions, error: null })
    expect(await getPublicAgenda('event-id')).toEqual(sessions)
  })

  it('getPublicAgenda returns empty on null', async () => {
    const chain = setup(null)
    chain.order.mockReturnValueOnce({ data: null, error: null })
    expect(await getPublicAgenda('event-id')).toEqual([])
  })

  it('getPublicSpeakers returns list', async () => {
    const spk = [{ id: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', name: 'Jane' }]
    const chain = setup(spk)
    chain.order.mockReturnValueOnce({ data: spk, error: null })
    expect(await getPublicSpeakers('event-id')).toEqual(spk)
  })

  it('getBookmarks maps session_ids', async () => {
    const rows = [{ session_id: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }]
    setup(rows)
    const result = await getBookmarks('u', 'e')
    expect(result).toContain('c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d')
  })

  it('getBookmarks returns empty on null', async () => {
    setup(null)
    expect(await getBookmarks('u', 'e')).toEqual([])
  })

  it('toggleBookmark removes when existing', async () => {
    const chain = setup({ id: 'bm-1' })
    chain.maybeSingle.mockResolvedValueOnce({ data: { id: 'bm-1' }, error: null })
    expect(await toggleBookmark('u', 'e', 's')).toBe('removed')
  })

  it('toggleBookmark adds when not existing', async () => {
    const chain = setup(null)
    chain.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    expect(await toggleBookmark('u', 'e', 's')).toBe('added')
  })
})
