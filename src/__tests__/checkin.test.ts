import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', email: 'staff@test.com' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Make the test user a super-admin so assertPermission short-circuits; permission
// logic is unit-tested separately in auth.test.ts.
vi.mock('@/lib/admin/gate', () => ({ isSuperAdmin: vi.fn().mockReturnValue(true) }))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

import {
  checkInByQR,
  checkInBySearch,
  undoCheckIn,
  getCheckInStats,
  processOfflineQueue,
  searchAttendeesForCheckIn,
} from '@/lib/checkin/actions'

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVENT_ID  = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const REG_ID    = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const ORG_ID    = 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5e'
const QR_CODE   = 'PREZVA-123456-ABC123'

const mockEvent  = { id: EVENT_ID, org_id: ORG_ID }
const mockMember = { role: 'staff' }
const mockReg    = {
  id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com',
  status: 'confirmed', ticket_types: { name: 'General' },
}

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'neq', 'or', 'order', 'limit']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.single = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  for (const k of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'neq', 'or', 'order', 'limit']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

function baseSetup(regOverride?: Record<string, any>) {
  mockFromImpl = (t) => {
    if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
    if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
    if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockReg, error: null }), ...regOverride })
    if (t === 'check_ins') return makeChain({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) })
    return makeChain()
  }
}

// ── checkInByQR ───────────────────────────────────────────────────────────────

describe('checkInByQR', () => {
  it('successfully checks in a new attendee', async () => {
    let checkInsCallCount = 0
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockReg, error: null }) })
      if (t === 'check_ins') {
        checkInsCallCount++
        if (checkInsCallCount === 1) {
          // "not found" — not yet checked in
          return makeChain({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) })
        }
        // insert
        return makeChain({ insert: vi.fn().mockResolvedValue({ error: null }) })
      }
      return makeChain()
    }
    const result = await checkInByQR(EVENT_ID, QR_CODE)
    expect(result.success).toBe(true)
    expect(result.registration?.attendee_name).toBe('Alice')
    expect(result.registration?.already_checked_in).toBe(false)
  })

  it('returns already_checked_in=true when attendee was already scanned', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockReg, error: null }) })
      if (t === 'check_ins') return makeChain({ single: vi.fn().mockResolvedValue({ data: { id: 'ci-1', checked_in_at: new Date().toISOString() }, error: null }) })
      return makeChain()
    }
    const result = await checkInByQR(EVENT_ID, QR_CODE)
    expect(result.success).toBe(true)
    expect(result.registration?.already_checked_in).toBe(true)
  })

  it('returns error when QR code not found', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
      return makeChain()
    }
    const result = await checkInByQR(EVENT_ID, 'INVALID-QR')
    expect(result.success).toBe(false)
    expect(result.error).toContain('QR code not found')
  })

  it('returns error for cancelled registration', async () => {
    const cancelledReg = { ...mockReg, status: 'cancelled' }
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: cancelledReg, error: null }) })
      return makeChain()
    }
    const result = await checkInByQR(EVENT_ID, QR_CODE)
    expect(result.success).toBe(false)
    expect(result.error).toContain('cancelled')
  })
})

// ── checkInBySearch ───────────────────────────────────────────────────────────

describe('checkInBySearch', () => {
  it('checks in attendee by registration ID', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockReg, error: null }) })
      if (t === 'check_ins') {
        const c = makeChain()
        c.single = vi.fn()
          .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
        c.insert = vi.fn().mockResolvedValue({ error: null })
        return c
      }
      return makeChain()
    }
    const result = await checkInBySearch(EVENT_ID, REG_ID)
    expect(result.success).toBe(true)
    expect(result.registration?.already_checked_in).toBe(false)
  })
})

// ── undoCheckIn ───────────────────────────────────────────────────────────────

describe('undoCheckIn', () => {
  it('deletes a check-in record', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'check_ins') {
        const c = makeChain()
        c.is = vi.fn().mockResolvedValue({ error: null })
        return c
      }
      return makeChain()
    }
    const result = await undoCheckIn(EVENT_ID, REG_ID)
    expect((result as any).success).toBe(true)
  })
})

// ── getCheckInStats ───────────────────────────────────────────────────────────

describe('getCheckInStats', () => {
  it('returns correct stats and recent check-ins', async () => {
    let checkInsCallCount = 0
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') {
        // count query: .select().eq().eq() — need chaining + final resolve
        let eqCount = 0
        const c: any = { select: vi.fn().mockReturnThis() }
        c.eq = vi.fn(() => { eqCount++; return eqCount >= 2 ? Promise.resolve({ count: 50, data: null, error: null }) : c })
        return c
      }
      if (t === 'check_ins') {
        checkInsCallCount++
        if (checkInsCallCount === 1) {
          // count query: .select().eq().is()
          const c: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
          c.is = vi.fn(() => Promise.resolve({ count: 23, data: null, error: null }))
          return c
        }
        // recent query: ends with .limit(20)
        const c = makeChain()
        c.limit = vi.fn().mockResolvedValue({
          data: [{
            id: 'ci-1', checked_in_at: new Date().toISOString(), method: 'qr_scan',
            registrations: { attendee_name: 'Alice', attendee_email: 'alice@test.com', ticket_types: { name: 'General' } },
          }],
          error: null,
        })
        return c
      }
      return makeChain()
    }
    const stats = await getCheckInStats(EVENT_ID)
    expect(stats.total_registered).toBe(50)
    expect(stats.total_checked_in).toBe(23)
    expect(stats.percent).toBe(46)
    expect(stats.recent).toHaveLength(1)
    expect(stats.recent[0].attendee_name).toBe('Alice')
  })

  it('returns 0% when no registrations', async () => {
    let checkInsCallCount = 0
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') {
        let eqCount = 0
        const c: any = { select: vi.fn().mockReturnThis() }
        c.eq = vi.fn(() => { eqCount++; return eqCount >= 2 ? Promise.resolve({ count: 0, data: null, error: null }) : c })
        return c
      }
      if (t === 'check_ins') {
        checkInsCallCount++
        if (checkInsCallCount === 1) {
          const c: any = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() }
          c.is = vi.fn(() => Promise.resolve({ count: 0, data: null, error: null }))
          return c
        }
        const c = makeChain(); c.limit = vi.fn().mockResolvedValue({ data: [], error: null }); return c
      }
      return makeChain()
    }
    const stats = await getCheckInStats(EVENT_ID)
    expect(stats.percent).toBe(0)
  })
})

// ── processOfflineQueue ───────────────────────────────────────────────────────

describe('processOfflineQueue', () => {
  it('validates required fields', async () => {
    const result = await processOfflineQueue({ eventId: 'bad-uuid', deviceId: 'd1', entries: [] })
    expect((result as any).error).toBeTruthy()
  })

  it('processes multiple offline entries', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockReg, error: null }) })
      if (t === 'check_ins') {
        const c = makeChain()
        c.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        c.insert = vi.fn().mockResolvedValue({ error: null })
        return c
      }
      return makeChain()
    }
    const result = await processOfflineQueue({
      eventId: EVENT_ID,
      deviceId: 'scanner-1',
      entries: [
        { qr_code: 'PREZVA-A', scanned_at: new Date().toISOString() },
        { qr_code: 'PREZVA-B', scanned_at: new Date().toISOString() },
      ],
    })
    expect((result as any).total).toBe(2)
  })
})

// ── searchAttendeesForCheckIn ─────────────────────────────────────────────────

describe('searchAttendeesForCheckIn', () => {
  it('returns empty array for short queries', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return makeChain()
    }
    const results = await searchAttendeesForCheckIn(EVENT_ID, 'A')
    expect(results).toHaveLength(0)
  })

  it('returns attendees matching query', async () => {
    const searchResult = [{
      id: REG_ID, attendee_name: 'Alice', attendee_email: 'alice@test.com',
      status: 'confirmed', ticket_types: { name: 'General' }, check_ins: [],
    }]
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'registrations') {
        const c = makeChain()
        c.limit = vi.fn().mockResolvedValue({ data: searchResult, error: null })
        return c
      }
      return makeChain()
    }
    const results = await searchAttendeesForCheckIn(EVENT_ID, 'Ali')
    expect(results).toHaveLength(1)
    expect(results[0].attendee_name).toBe('Alice')
    expect(results[0].checked_in).toBe(false)
  })
})
