import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { getConversations, getMessages, sendMessage, getAttendeeDirectory } from '@/lib/messaging/actions'

const EVT = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const CONV = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makeChain(data: any = null, error: any = null) {
  const c: any = {}
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.neq = vi.fn().mockReturnValue(c)
  c.not = vi.fn().mockReturnValue(c)
  c.or = vi.fn().mockReturnValue(c)
  c.order = vi.fn().mockReturnValue({ data, error })
  c.single = vi.fn().mockResolvedValue({ data, error })
  c.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  c.in = vi.fn().mockReturnValue(c)
  c.limit = vi.fn().mockReturnValue(c)
  c.insert = vi.fn().mockReturnValue(c)
  c.update = vi.fn().mockReturnValue(c)
  c.then = (res: any, rej: any) => Promise.resolve({ data, error }).then(res, rej)
  return c
}

describe('Messaging Actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getConversations returns list', async () => {
    const convs = [{ id: CONV, event_id: EVT }]
    const c = makeChain(convs)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    c.order.mockReturnValueOnce({ data: convs, error: null })
    expect(await getConversations(EVT)).toEqual(convs)
  })

  it('getConversations returns empty on null', async () => {
    const c = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    c.order.mockReturnValueOnce({ data: null, error: null })
    expect(await getConversations(EVT)).toEqual([])
  })

  it('getMessages returns messages', async () => {
    const msgs = [{ id: 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', body: 'Hi' }]
    const c = makeChain(msgs)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    c.order.mockReturnValueOnce({ data: msgs, error: null })
    expect(await getMessages(CONV)).toEqual(msgs)
  })

  it('sendMessage returns error on empty body', async () => {
    const c = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    expect(await sendMessage(CONV, '   ')).toHaveProperty('error')
  })

  it('sendMessage inserts and returns data', async () => {
    const msg = { id: 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', body: 'Hello', sender_id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }
    const c = makeChain(null)
    c.single.mockResolvedValueOnce({ data: msg, error: null })
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    const res = await sendMessage(CONV, 'Hello')
    expect(res).toHaveProperty('data')
  })

  it('getAttendeeDirectory returns filtered list', async () => {
    const rows = [{ user_id: 'e1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', attendee_name: 'Jane', interests: [] }]
    const c = makeChain(rows)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(c) })
    c.then = (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej)
    expect(await getAttendeeDirectory(EVT)).toEqual(rows)
  })
})
