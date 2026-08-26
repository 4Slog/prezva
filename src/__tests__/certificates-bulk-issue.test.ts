import { describe, it, expect, beforeEach, vi } from 'vitest'

// R62. The dashboard bulk door after it stopped issuing certificates itself.
// What matters here is not that it enqueues — it is that a DROPPED enqueue
// cannot be mistaken for a completed run, and that authorization still happens
// before anything is scheduled.

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(),
}))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(),
}))
vi.mock('@/lib/trigger', () => ({
  enqueueCertificateIssueSweep: vi.fn(),
}))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import { bulkIssueCertificates } from '@/lib/certificates/bulk-issue'
import { enqueueCertificateIssueSweep } from '@/lib/trigger'
import { assertPermission } from '@/lib/auth/assert-permission'
import { requireUser } from '@/lib/auth/get-user'

const EVENT_ID = 'event-1'
const ORG_ID = 'org-1'

// registrations is counted head+exact, so the stub resolves { count }, not rows.
function mountTables(opts: { event: any; confirmed: number }) {
  mockFromImpl = (table: string) => {
    if (table === 'events') {
      return {
        select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: opts.event, error: null }) }) }),
      }
    }
    if (table === 'registrations') {
      const chain: any = {
        select: (_cols?: string, o?: any) => {
          // Pin the technique, not just the number: a plain row select would
          // disagree with the page's own count under PostgREST's max-rows cap.
          expect(o).toEqual({ count: 'exact', head: true })
          return chain
        },
        eq: () => chain,
        then: (res: any, rej: any) =>
          Promise.resolve({ count: opts.confirmed, data: null, error: null }).then(res, rej),
      }
      return chain
    }
    throw new Error(`unexpected table ${table}`)
  }
}

beforeEach(() => {
  vi.mocked(enqueueCertificateIssueSweep).mockReset()
  vi.mocked(assertPermission).mockReset().mockResolvedValue(undefined as any)
  vi.mocked(requireUser).mockReset().mockResolvedValue({ id: 'user-1' } as any)
  mockFrom.mockClear()
})

describe('bulkIssueCertificates', () => {
  it('enqueues one dashboard sweep and returns the candidate count', async () => {
    mountTables({ event: { org_id: ORG_ID }, confirmed: 3 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue({ id: 'run_1' } as any)

    const result = await bulkIssueCertificates(EVENT_ID)

    expect(result).toEqual({ queued: 3 })
    expect(enqueueCertificateIssueSweep).toHaveBeenCalledTimes(1)
    expect(enqueueCertificateIssueSweep).toHaveBeenCalledWith({ eventId: EVENT_ID, via: 'dashboard' })
  })

  it('authorizes BEFORE enqueuing — a permission failure queues nothing', async () => {
    mountTables({ event: { org_id: ORG_ID }, confirmed: 1 })
    vi.mocked(assertPermission).mockRejectedValue(new Error('forbidden'))

    await expect(bulkIssueCertificates(EVENT_ID)).rejects.toThrow('forbidden')
    expect(enqueueCertificateIssueSweep).not.toHaveBeenCalled()
  })

  it('checks certificates.manage on the event org', async () => {
    mountTables({ event: { org_id: ORG_ID }, confirmed: 0 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue({ id: 'run_1' } as any)

    await bulkIssueCertificates(EVENT_ID)

    expect(assertPermission).toHaveBeenCalledWith(ORG_ID, 'user-1', 'certificates.manage')
  })

  it('a NULL enqueue yields { error: queue-unavailable } and NOT a queued count', async () => {
    mountTables({ event: { org_id: ORG_ID }, confirmed: 2 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue(null)

    const result = await bulkIssueCertificates(EVENT_ID)

    // Pinned three ways on purpose. enqueueCertificateIssueSweep never throws —
    // it returns null when TRIGGER_SECRET_KEY is unset or Trigger.dev is down —
    // so collapsing a null handle into { queued: 0 }, or worse into
    // { queued: 2 }, tells the organizer that certificates are on their way
    // when nothing was scheduled at all.
    expect(result).toEqual({ error: 'queue-unavailable' })
    expect('queued' in result).toBe(false)
    expect(result).not.toEqual({ queued: 0 })
  })

  it('a missing event yields { error: event-not-found } and never reaches the queue', async () => {
    mountTables({ event: null, confirmed: 0 })

    const result = await bulkIssueCertificates(EVENT_ID)

    // Distinct from queue-unavailable. These used to be the same value —
    // { issued: 0, skipped: 0, failed: 0 } — so "no such event" was
    // indistinguishable from "ran fine over an empty event".
    expect(result).toEqual({ error: 'event-not-found' })
    expect('queued' in result).toBe(false)
    expect(enqueueCertificateIssueSweep).not.toHaveBeenCalled()
    expect(assertPermission).not.toHaveBeenCalled()
  })

  it('an event with zero confirmed registrations still enqueues, reporting queued: 0', async () => {
    // queued: 0 is a legitimate SUCCESS here — the sweep will run and find
    // nobody. It is only illegitimate as a stand-in for a dropped enqueue,
    // which is why that case returns an error instead of this shape.
    mountTables({ event: { org_id: ORG_ID }, confirmed: 0 })
    vi.mocked(enqueueCertificateIssueSweep).mockResolvedValue({ id: 'run_1' } as any)

    expect(await bulkIssueCertificates(EVENT_ID)).toEqual({ queued: 0 })
  })
})
