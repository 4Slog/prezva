import { describe, it, expect, beforeEach, vi } from 'vitest'

// R62. The embed bulk door. Same two properties the dashboard door is pinned
// on — a dropped enqueue must not read as a completed run, and both embed
// guards must run before anything is scheduled — proven through the REAL
// exported action rather than against the sweep, for the reason spelled out at
// the top of embedded-certificates-actions.test.ts.

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ get: vi.fn().mockReturnValue({ value: 'fake-embed-token' }) }),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn().mockResolvedValue({ location_id: 'loc_1' }),
  COOKIE_NAME: 'embed_session',
}))
// Bulk no longer touches the core — it enqueues. Mocked bare so this file does
// not drag in token encryption at module load.
vi.mock('@/lib/certificates/issue-core', () => ({
  issueCertificateCore: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueCertificateIssueSweep: vi.fn(),
}))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { embedBulkIssueCertificates } from '@/lib/embedded/certificates-actions'
import { enqueueCertificateIssueSweep } from '@/lib/trigger'
import { issueCertificateCore } from '@/lib/certificates/issue-core'
import { verifyEmbeddedSession } from '@/lib/embedded/session'

const EVENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG_ID = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'

function mountTables(opts: { link?: any; event?: any; confirmed?: number }) {
  const { link = { org_id: ORG_ID }, event = { id: EVENT_ID, org_id: ORG_ID }, confirmed = 0 } = opts
  mockFromImpl = (table: string) => {
    if (table === 'ghl_location_links') {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: link, error: null }) }) }) }
    }
    if (table === 'events') {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: event, error: null }),
      }
      return chain
    }
    if (table === 'registrations') {
      const chain: any = {
        select: (_cols?: string, o?: any) => {
          expect(o).toEqual({ count: 'exact', head: true })
          return chain
        },
        eq: () => chain,
        then: (res: any, rej: any) =>
          Promise.resolve({ count: confirmed, data: null, error: null }).then(res, rej),
      }
      return chain
    }
    throw new Error(`unexpected table ${table}`)
  }
}

beforeEach(() => {
  vi.mocked(enqueueCertificateIssueSweep).mockReset()
  vi.mocked(issueCertificateCore).mockReset()
  vi.mocked(verifyEmbeddedSession).mockReset().mockResolvedValue({ location_id: 'loc_1' } as any)
  mockFrom.mockClear()
})

describe('embedBulkIssueCertificates', () => {
  it('enqueues one embed sweep and returns the candidate count', async () => {
    mountTables({ confirmed: 2 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue({ id: 'run_1' } as any)

    const result = await embedBulkIssueCertificates(EVENT_ID)

    expect(result).toEqual({ queued: 2 })
    expect(enqueueCertificateIssueSweep).toHaveBeenCalledTimes(1)
    // via: 'embed' is the audit row's only attribution — this door has no
    // Prezva user id to record.
    expect(enqueueCertificateIssueSweep).toHaveBeenCalledWith({ eventId: EVENT_ID, via: 'embed' })
  })

  it('no longer issues certificates inline — the core is never called', async () => {
    mountTables({ confirmed: 3 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue({ id: 'run_1' } as any)

    await embedBulkIssueCertificates(EVENT_ID)

    // The serial loop is what Vercel was killing partway through. If this ever
    // goes green-with-calls again, the timeout is back.
    expect(issueCertificateCore).not.toHaveBeenCalled()
  })

  it('a NULL enqueue yields { error: queue-unavailable } and NOT a queued count', async () => {
    mountTables({ confirmed: 2 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue(null)

    const result = await embedBulkIssueCertificates(EVENT_ID)

    expect(result).toEqual({ error: 'queue-unavailable' })
    expect('queued' in result).toBe(false)
    expect(result).not.toEqual({ queued: 0 })
  })

  it('refuses an event owned by another org, and queues nothing', async () => {
    // assertEventOwnership joins on org_id, so a foreign event resolves to null.
    mountTables({ event: null, confirmed: 1 })

    await expect(embedBulkIssueCertificates(EVENT_ID)).rejects.toThrow('Event not found or access denied')
    expect(enqueueCertificateIssueSweep).not.toHaveBeenCalled()
  })

  it('refuses an unlinked location, and queues nothing', async () => {
    mountTables({ link: null, confirmed: 1 })

    await expect(embedBulkIssueCertificates(EVENT_ID)).rejects.toThrow('Location not linked to any organization')
    expect(enqueueCertificateIssueSweep).not.toHaveBeenCalled()
  })

  it('refuses an invalid embed session, and queues nothing', async () => {
    mountTables({ confirmed: 1 })
    vi.mocked(verifyEmbeddedSession).mockRejectedValue(new Error('bad signature'))

    await expect(embedBulkIssueCertificates(EVENT_ID)).rejects.toThrow('bad signature')
    expect(enqueueCertificateIssueSweep).not.toHaveBeenCalled()
  })

  it('an event with zero confirmed registrations still enqueues, reporting queued: 0', async () => {
    mountTables({ confirmed: 0 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue({ id: 'run_1' } as any)

    expect(await embedBulkIssueCertificates(EVENT_ID)).toEqual({ queued: 0 })
  })
})
