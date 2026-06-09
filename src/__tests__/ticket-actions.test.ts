import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'user-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))

import { createClient } from '@/lib/supabase/server'
import { assertPermission } from '@/lib/auth/assert-permission'
import { PermissionError } from '@/lib/auth/permission-error'
import { createTicketType, updateTicketType, deleteTicketType } from '@/lib/registration/ticket-actions'

const EVT_ID    = 'evt-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const TICKET_ID = 'tkt-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const ORG_ID    = 'org-a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makeClient() {
  const chain: any = {}
  chain.select    = vi.fn().mockReturnValue(chain)
  chain.eq        = vi.fn().mockReturnValue(chain)
  chain.in        = vi.fn().mockReturnValue(chain)
  chain.insert    = vi.fn().mockReturnValue(chain)
  chain.update    = vi.fn().mockReturnValue(chain)
  chain.delete    = vi.fn().mockReturnValue(chain)
  chain.single    = vi.fn().mockResolvedValue({ data: { org_id: ORG_ID }, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { org_id: ORG_ID }, error: null })
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('ticket-actions — permission deny path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(createClient as any).mockResolvedValue(makeClient())
    ;(assertPermission as any).mockRejectedValue(new PermissionError('event.tickets'))
  })

  it('createTicketType returns {error} when assertPermission denies', async () => {
    const fd = new FormData()
    fd.set('name', 'GA')
    const result = await createTicketType(EVT_ID, fd)
    expect('error' in result).toBe(true)
    if ('error' in result) expect(typeof result.error).toBe('string')
  })

  it('updateTicketType returns {error} when assertPermission denies', async () => {
    const result = await updateTicketType(TICKET_ID, EVT_ID, new FormData())
    expect('error' in result).toBe(true)
    if ('error' in result) expect(typeof result.error).toBe('string')
  })

  it('deleteTicketType returns {error} when assertPermission denies', async () => {
    const result = await deleteTicketType(TICKET_ID, EVT_ID)
    expect('error' in result).toBe(true)
    if ('error' in result) expect(typeof result.error).toBe('string')
  })
})
