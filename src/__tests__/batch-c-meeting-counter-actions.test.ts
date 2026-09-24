// Batch C commit 4 (O134): recipient accept / decline / counter and the
// requester's answer to a counter actually persist; every failure is returned.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, userId: 'bob' }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: h.userId })) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { respondToMeetingRequest, respondToCounterProposal } from '@/lib/networking/sprint8-actions'

const COUNTER = { at: '2026-10-06T19:00:00.000Z', tz: 'America/New_York' }
const row = () => h.db.tables.meeting_requests.find((r: any) => r.id === 'm1')

beforeEach(() => {
  h.userId = 'bob'
  h.db = createFakeDb({
    meeting_requests: [{ id: 'm1', event_id: 'e1', requester_id: 'ann', recipient_id: 'bob', status: 'pending', meeting_at: null }],
  })
})

describe('recipient responds', () => {
  it('accept persists', async () => {
    expect(await respondToMeetingRequest('m1', 'accepted')).toEqual({ ok: true, status: 'accepted' })
    expect(row().status).toBe('accepted')
  })

  it('decline persists', async () => {
    expect(await respondToMeetingRequest('m1', 'declined')).toEqual({ ok: true, status: 'declined' })
    expect(row().status).toBe('declined')
  })

  it('counter stores { at, tz } and the note, and sets countered', async () => {
    expect(await respondToMeetingRequest('m1', 'counter', COUNTER, ' lounge ')).toEqual({ ok: true, status: 'countered' })
    expect(row()).toMatchObject({ status: 'countered', meeting_counter_time: COUNTER, meeting_counter_note: 'lounge' })
  })

  it('an invalid counter time is refused and nothing is written', async () => {
    expect(await respondToMeetingRequest('m1', 'counter', { at: 'Monday 2pm', tz: 'Mars/Base' })).toHaveProperty('error')
    expect(await respondToMeetingRequest('m1', 'counter', undefined)).toHaveProperty('error')
    expect(row().status).toBe('pending')
    expect(h.db.writesTo('meeting_requests')).toEqual([])
  })

  it('someone who is not the recipient gets an error, not a silent success', async () => {
    h.userId = 'ann'
    expect(await respondToMeetingRequest('m1', 'accepted')).toHaveProperty('error')
    expect(row().status).toBe('pending')
  })

  it('a request that is no longer pending returns an error', async () => {
    await respondToMeetingRequest('m1', 'declined')
    expect(await respondToMeetingRequest('m1', 'accepted')).toHaveProperty('error')
    expect(row().status).toBe('declined')
  })

  it('a database error is surfaced', async () => {
    const from = h.db.client.from
    h.db.client.from = vi.fn(() => { const b = from('meeting_requests'); b.select = vi.fn(async () => ({ data: null, error: { message: 'column does not exist' } })); return b })
    expect(await respondToMeetingRequest('m1', 'accepted')).toEqual({ error: 'column does not exist' })
  })
})

describe('requester answers the counter', () => {
  beforeEach(async () => {
    await respondToMeetingRequest('m1', 'counter', COUNTER)
    h.userId = 'ann'
  })

  it('accept persists and books the countered time', async () => {
    expect(await respondToCounterProposal('m1', 'accepted')).toEqual({ ok: true, status: 'accepted' })
    expect(row()).toMatchObject({ status: 'accepted', meeting_at: COUNTER.at })
  })

  it('decline persists', async () => {
    expect(await respondToCounterProposal('m1', 'declined')).toEqual({ ok: true, status: 'declined' })
    expect(row().status).toBe('declined')
  })

  it('the recipient cannot answer their own counter', async () => {
    h.userId = 'bob'
    expect(await respondToCounterProposal('m1', 'accepted')).toHaveProperty('error')
    expect(row().status).toBe('countered')
  })
})
