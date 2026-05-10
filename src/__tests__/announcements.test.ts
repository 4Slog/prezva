import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'user-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { getAnnouncements, createAnnouncement, deleteAnnouncement } from '@/lib/announcements/actions'

const ANN_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const EVT_ID = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makeChain(data: any = null, error: any = null) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue({ data, error })
  chain.single = vi.fn().mockResolvedValue({ data, error })
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  // make chain awaitable for delete().eq()
  chain.then = (res: any, rej: any) => Promise.resolve({ data, error }).then(res, rej)
  return chain
}

describe('Announcements', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getAnnouncements returns list', async () => {
    const anns = [{ id: ANN_ID, title: 'Hello' }]
    const chain = makeChain(anns)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })
    expect(await getAnnouncements(EVT_ID)).toEqual(anns)
  })

  it('getAnnouncements returns empty on null', async () => {
    const chain = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })
    expect(await getAnnouncements(EVT_ID)).toEqual([])
  })

  it('createAnnouncement returns error on invalid input', async () => {
    const chain = makeChain(0)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })
    const fd = new FormData()
    fd.set('title', '')
    fd.set('body', 'body')
    fd.set('channel', 'email')
    const res = await createAnnouncement(EVT_ID, fd)
    expect(res).toHaveProperty('error')
  })

  it('createAnnouncement creates successfully', async () => {
    const ann = { id: ANN_ID, title: 'Test', body: 'Msg', channel: 'email', recipient_count: 5 }
    const countChain = makeChain(5)
    const insertChain = makeChain(ann)
    insertChain.single.mockResolvedValue({ data: ann, error: null })
    const fromMock = vi.fn()
      .mockReturnValueOnce(countChain)
      .mockReturnValueOnce(insertChain)
    ;(createClient as any).mockResolvedValue({ from: fromMock })
    const fd = new FormData()
    fd.set('title', 'Test')
    fd.set('body', 'Message body here')
    fd.set('channel', 'email')
    const res = await createAnnouncement(EVT_ID, fd)
    expect(res).toHaveProperty('data')
  })

  it('deleteAnnouncement calls delete', async () => {
    const chain = makeChain(null)
    ;(createClient as any).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) })
    const res = await deleteAnnouncement(ANN_ID, EVT_ID)
    expect(res).toHaveProperty('success', true)
  })
})
