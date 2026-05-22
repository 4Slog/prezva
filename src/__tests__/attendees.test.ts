import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock calls are hoisted — factories must be self-contained (no outer vars)
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: 'user-1', email: 'test@test.com' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockFrom })),
}))

import {
  getAttendees,
  manualAddAttendee,
  updateAttendee,
  removeAttendee,
  exportAttendeesCSV,
  importAttendeesCSV,
} from '@/lib/attendees/actions'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(override: Record<string, any> = {}) {
  const base: Record<string, any> = {}
  for (const k of ['select', 'insert', 'update', 'eq', 'or', 'range', 'order', 'limit']) {
    base[k] = vi.fn().mockReturnThis()
  }
  base.single = vi.fn()
  for (const k of Object.keys(override)) base[k] = override[k]
  // ensure chain methods still return the chain (unless overridden)
  for (const k of ['select', 'insert', 'update', 'eq', 'or', 'range', 'order', 'limit']) {
    if (!override[k]) base[k] = vi.fn().mockReturnValue(base)
  }
  return base
}

const EVENT_ID  = 'c7ab5d07-0883-4682-94be-38ad7fa91301'
const REG_ID    = 'b1bec6aa-2765-4e77-b45a-df583f64ad78'
const TICKET_ID = 'ea991979-3afd-4525-a821-0cdfd7ac8a04'
const ORG_ID    = '4605ec36-c670-493d-8e30-872bb886f835'

const mockEvent  = { id: EVENT_ID, org_id: ORG_ID, capacity: null, registration_count: 0, name: 'Test Event' }
const mockMember = { role: 'admin' }
const mockReg    = {
  id: REG_ID, event_id: EVENT_ID, ticket_type_id: TICKET_ID,
  attendee_name: 'Alice', attendee_email: 'alice@test.com',
  status: 'confirmed', qr_code: 'QR1', amount_paid_cents: 0,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  user_id: null,
  ticket_types: { name: 'General', price_cents: 0 },
  check_ins: [],
}

function regListChain() {
  const c = makeChain()
  const resolvedData = { data: [mockReg], count: 1, error: null }
  c.range = vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue(resolvedData),
  })
  // exportAttendeesCSV uses .eq().order().limit() — make limit() resolve
  c.limit = vi.fn().mockResolvedValue(resolvedData)
  return c
}

// ── getAttendees ──────────────────────────────────────────────────────────────

describe('getAttendees', () => {
  it('returns paginated attendees', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return regListChain()
    }
    const result = await getAttendees(EVENT_ID)
    expect(result.attendees).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.attendees[0].ticket_name).toBe('General')
    expect(result.attendees[0].checked_in).toBe(false)
  })

  it('clamps pageSize to max 100', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return regListChain()
    }
    const result = await getAttendees(EVENT_ID, { pageSize: 9999 })
    expect(result.pageSize).toBe(100)
  })

  it('computes totalPages correctly', async () => {
    const bigChain = makeChain()
    bigChain.range = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: Array(25).fill(mockReg), count: 73, error: null }),
    })
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return bigChain
    }
    const result = await getAttendees(EVENT_ID, { pageSize: 25 })
    expect(result.totalPages).toBe(3)
    expect(result.total).toBe(73)
  })
})

// ── manualAddAttendee ─────────────────────────────────────────────────────────

describe('manualAddAttendee', () => {
  it('inserts and returns new registration', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return makeChain({ single: vi.fn().mockResolvedValue({ data: { id: REG_ID, status: 'confirmed' }, error: null }) })
    }
    const result = await manualAddAttendee({ eventId: EVENT_ID, attendeeName: 'Bob', attendeeEmail: 'bob@test.com', ticketTypeId: TICKET_ID })
    expect((result as any).data?.id).toBe(REG_ID)
    expect((result as any).error).toBeUndefined()
  })

  it('returns capacity error when event is full', async () => {
    const fullEvent = { ...mockEvent, capacity: 10, registration_count: 10 }
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: fullEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return makeChain()
    }
    const result = await manualAddAttendee({ eventId: EVENT_ID, attendeeName: 'Bob', attendeeEmail: 'bob@test.com', ticketTypeId: TICKET_ID })
    expect((result as any).error).toBe('Event is at capacity')
  })

  it('rejects invalid email', async () => {
    const result = await manualAddAttendee({ eventId: EVENT_ID, attendeeName: 'Bob', attendeeEmail: 'notanemail', ticketTypeId: TICKET_ID })
    expect((result as any).error).toBeTruthy()
  })

  it('rejects empty name', async () => {
    const result = await manualAddAttendee({ eventId: EVENT_ID, attendeeName: '', attendeeEmail: 'bob@test.com', ticketTypeId: TICKET_ID })
    expect((result as any).error).toBeTruthy()
  })
})

// ── updateAttendee ────────────────────────────────────────────────────────────

describe('updateAttendee', () => {
  it('updates status successfully', async () => {
    let regCount = 0
    mockFromImpl = (t) => {
      if (t === 'registrations') {
        regCount++
        return makeChain({
          single: vi.fn().mockResolvedValue(
            regCount === 1
              ? { data: { event_id: EVENT_ID }, error: null }
              : { data: { id: REG_ID, status: 'cancelled' }, error: null }
          ),
        })
      }
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return makeChain()
    }
    const result = await updateAttendee({ registrationId: REG_ID, status: 'cancelled' })
    expect((result as any).error).toBeUndefined()
  })

  it('rejects invalid status', async () => {
    const result = await updateAttendee({ registrationId: REG_ID, status: 'unknown' as any })
    expect((result as any).error).toBeTruthy()
  })
})

// ── removeAttendee ────────────────────────────────────────────────────────────

describe('removeAttendee', () => {
  it('soft-deletes by setting status to cancelled', async () => {
    mockFromImpl = (t) => {
      if (t === 'registrations') {
        const c = makeChain()
        c.single = vi.fn().mockResolvedValue({ data: { event_id: EVENT_ID }, error: null })
        c.update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        return c
      }
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return makeChain()
    }
    const result = await removeAttendee(REG_ID)
    expect((result as any).success).toBe(true)
  })
})

// ── exportAttendeesCSV ────────────────────────────────────────────────────────

describe('exportAttendeesCSV', () => {
  it('returns CSV with correct headers and data', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      return regListChain()
    }
    const csv = await exportAttendeesCSV(EVENT_ID)
    expect(csv).toContain('"Name"')
    expect(csv).toContain('"Email"')
    expect(csv).toContain('"Alice"')
  })
})

// ── importAttendeesCSV ────────────────────────────────────────────────────────

describe('importAttendeesCSV', () => {
  const validCsv = 'Name,Email\nAlice,alice@test.com\nBob,bob@test.com'

  it('imports valid rows', async () => {
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'ticket_types') return makeChain({ limit: vi.fn().mockResolvedValue({ data: [{ id: TICKET_ID }], error: null }) })
      return makeChain({ insert: vi.fn().mockResolvedValue({ error: null }) })
    }
    const result = await importAttendeesCSV(EVENT_ID, validCsv)
    expect((result as any).imported).toBe(2)
    expect((result as any).errors).toHaveLength(0)
  })

  it('skips rows with invalid email', async () => {
    const badCsv = 'Name,Email\nAlice,notanemail\nBob,bob@test.com'
    mockFromImpl = (t) => {
      if (t === 'events') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }) })
      if (t === 'org_members') return makeChain({ single: vi.fn().mockResolvedValue({ data: mockMember, error: null }) })
      if (t === 'ticket_types') return makeChain({ limit: vi.fn().mockResolvedValue({ data: [{ id: TICKET_ID }], error: null }) })
      return makeChain({ insert: vi.fn().mockResolvedValue({ error: null }) })
    }
    const result = await importAttendeesCSV(EVENT_ID, badCsv)
    expect((result as any).imported).toBe(1)
    expect((result as any).errors).toHaveLength(1)
  })
})
