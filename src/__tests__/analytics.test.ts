import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn().mockResolvedValue({ id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' }) }))

import { createClient } from '@/lib/supabase/server'
import { getEventAnalytics } from '@/lib/analytics/actions'

const EVT = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

function makePromiseResult(data: any, error: any = null) {
  const c: any = {}
  c.select = vi.fn().mockReturnValue(c)
  c.eq = vi.fn().mockReturnValue(c)
  c.single = vi.fn().mockResolvedValue({ data, error })
  c.then = (res: any, rej: any) => Promise.resolve({ data, error }).then(res, rej)
  return c
}

describe('Analytics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns zeroed analytics when no data', async () => {
    const from = vi.fn().mockReturnValue(makePromiseResult(null))
    ;(createClient as any).mockResolvedValue({ from })
    const result = await getEventAnalytics(EVT)
    expect(result.totalRegistrations).toBe(0)
    expect(result.confirmedRegistrations).toBe(0)
    expect(result.checkedIn).toBe(0)
    expect(result.checkInRate).toBe(0)
    expect(result.totalRevenueCents).toBe(0)
  })

  it('calculates confirmed registrations correctly', async () => {
    const regs = [
      { status: 'confirmed', amount_paid_cents: 5000, ticket_type_id: null, created_at: '2025-01-01T10:00:00Z' },
      { status: 'confirmed', amount_paid_cents: 5000, ticket_type_id: null, created_at: '2025-01-01T11:00:00Z' },
      { status: 'pending', amount_paid_cents: 0, ticket_type_id: null, created_at: '2025-01-02T10:00:00Z' },
    ]
    const calls: any[] = []
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'events') return makePromiseResult({ capacity: 100, registration_count: 3, checked_in_count: 1 })
      if (table === 'registrations') return makePromiseResult(regs)
      if (table === 'check_ins') return makePromiseResult([{ id: '1' }])
      return makePromiseResult(null)
    })
    ;(createClient as any).mockResolvedValue({ from })
    const result = await getEventAnalytics(EVT)
    expect(result.confirmedRegistrations).toBe(2)
    expect(result.totalRevenueCents).toBe(10000)
    expect(result.totalRegistrations).toBe(3)
  })

  it('calculates check-in rate', async () => {
    const regs = Array(4).fill(null).map(() => ({ status: 'confirmed', amount_paid_cents: 0, ticket_type_id: null, created_at: '2025-01-01T10:00:00Z' }))
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'registrations') return makePromiseResult(regs)
      if (table === 'check_ins') return makePromiseResult([{ id: '1' }, { id: '2' }])
      return makePromiseResult(null)
    })
    ;(createClient as any).mockResolvedValue({ from })
    const result = await getEventAnalytics(EVT)
    expect(result.checkInRate).toBe(50)
    expect(result.checkedIn).toBe(2)
  })

  it('groups registrations by day', async () => {
    const regs = [
      { status: 'confirmed', amount_paid_cents: 0, ticket_type_id: null, created_at: '2025-01-01T08:00:00Z' },
      { status: 'confirmed', amount_paid_cents: 0, ticket_type_id: null, created_at: '2025-01-01T12:00:00Z' },
      { status: 'confirmed', amount_paid_cents: 0, ticket_type_id: null, created_at: '2025-01-02T09:00:00Z' },
    ]
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'registrations') return makePromiseResult(regs)
      return makePromiseResult(null)
    })
    ;(createClient as any).mockResolvedValue({ from })
    const result = await getEventAnalytics(EVT)
    expect(result.registrationsByDay).toHaveLength(2)
    expect(result.registrationsByDay[0]).toEqual({ date: '2025-01-01', count: 2 })
    expect(result.registrationsByDay[1]).toEqual({ date: '2025-01-02', count: 1 })
  })

  it('capacity is null when not set', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'events') return makePromiseResult({ capacity: null })
      return makePromiseResult(null)
    })
    ;(createClient as any).mockResolvedValue({ from })
    const result = await getEventAnalytics(EVT)
    expect(result.capacity).toBeNull()
  })

  it('counts announcements and survey responses', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'announcements') return makePromiseResult([{ id: '1' }, { id: '2' }, { id: '3' }])
      if (table === 'survey_responses') return makePromiseResult([{ id: '1' }, { id: '2' }])
      return makePromiseResult(null)
    })
    ;(createClient as any).mockResolvedValue({ from })
    const result = await getEventAnalytics(EVT)
    expect(result.announcementCount).toBe(3)
    expect(result.surveyResponseCount).toBe(2)
  })
})
