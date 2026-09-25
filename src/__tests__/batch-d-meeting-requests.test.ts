// Batch D commit 4 (O142, D-R6): a new meeting request cannot overwrite an
// open one. pending / countered / accepted — in either direction — block it
// with a message; declined / cancelled may be asked again, and the re-request
// starts clean (no stale counter-proposal or booked time).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const ANN = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const h = vi.hoisted(() => ({ db: null as any, userId: '11111111-1111-4111-8111-111111111111' }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: h.userId })) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendMeetingRequest } from '@/lib/networking/sprint8-actions'

const MESSAGES = {
  pending: 'You already have a pending request with this person',
  countered: 'A new time has been proposed — accept or decline it in your meeting requests',
  accepted: 'You already have a meeting scheduled with this person',
} as const

const COUNTER = { at: '2026-10-06T19:00:00.000Z', tz: 'America/New_York' }
const ask = (to = BOB) => sendMeetingRequest('e1', { recipient_id: to, message: 'coffee?' })

function seed(row: Record<string, any> | null) {
  h.db = createFakeDb({ meeting_requests: row ? [{ id: 'm1', event_id: 'e1', ...row }] : [] })
}

beforeEach(() => { h.userId = ANN })

describe.each(Object.entries(MESSAGES))('an existing %s request', (status, message) => {
  it('blocks a new request from the same requester', async () => {
    seed({ requester_id: ANN, recipient_id: BOB, status, meeting_counter_time: COUNTER })
    expect(await ask()).toEqual({ error: message })
    expect(h.db.writesTo('meeting_requests')).toEqual([])
    expect(h.db.tables.meeting_requests[0].status).toBe(status)
  })

  it('blocks a request in the other direction', async () => {
    seed({ requester_id: BOB, recipient_id: ANN, status })
    // A counter on their request is mine, so it is waiting on them.
    expect(await ask()).toEqual({ error: status === 'countered' ? 'You proposed a new time — waiting for them to respond' : message })
    expect(h.db.writesTo('meeting_requests')).toEqual([])
    expect(h.db.tables.meeting_requests).toHaveLength(1)
  })
})

describe('asking again', () => {
  it('after a decline: the request is pending again and the counter fields and meeting_at are cleared', async () => {
    seed({
      requester_id: ANN, recipient_id: BOB, status: 'declined',
      meeting_at: '2026-10-06T19:00:00.000Z', meeting_counter_time: COUNTER, meeting_counter_note: 'lounge',
    })
    expect(await ask()).toEqual({ success: true })
    expect(h.db.tables.meeting_requests).toHaveLength(1)
    expect(h.db.tables.meeting_requests[0]).toMatchObject({
      status: 'pending', message: 'coffee?', meeting_at: null, meeting_counter_time: null, meeting_counter_note: null,
    })
  })

  it('after a cancellation is allowed', async () => {
    seed({ requester_id: ANN, recipient_id: BOB, status: 'cancelled' })
    expect(await ask()).toEqual({ success: true })
    expect(h.db.tables.meeting_requests[0].status).toBe('pending')
  })

  it('a first request goes through', async () => {
    seed(null)
    expect(await ask()).toEqual({ success: true })
    expect(h.db.tables.meeting_requests).toMatchObject([{ requester_id: ANN, recipient_id: BOB, status: 'pending' }])
  })

  it('a lookup error is surfaced, not treated as "no request"', async () => {
    seed(null)
    const from = h.db.client.from
    h.db.client.from = vi.fn((t: string) => { const b = from(t); b.maybeSingle = vi.fn(async () => ({ data: null, error: { message: 'boom' } })); return b })
    expect(await ask()).toEqual({ error: 'boom' })
  })
})
