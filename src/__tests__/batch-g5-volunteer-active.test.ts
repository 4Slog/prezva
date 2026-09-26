// Batch G5 (O158, G-R5): a declined or no-show volunteer's portal token no
// longer checks attendees in, clocks in (which used to un-decline them) or
// looks attendees up. Token checks, role checks and response shapes unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/engagement/points', () => ({ awardPoints: vi.fn(async () => 10) }))

import { POST as checkin } from '@/app/api/volunteer/[token]/checkin/route'
import { POST as clockIn } from '@/app/api/volunteer/[token]/clock-in/route'
import { GET as lookup } from '@/app/api/volunteer/[token]/lookup/route'
import { respondToVolunteerShift } from '@/lib/volunteers/actions'
import { VOLUNTEER_INACTIVE_ERROR, isVolunteerActive } from '@/lib/volunteers/active'

const TOKEN = 'tok'
function setup(v: { status: string; shift_response?: string | null }, opts: { failWrite?: boolean } = {}) {
  const volunteer = {
    id: 'vol-1', event_id: 'e1', role: 'check-in', user_id: 'vol-user', name: 'Val', email: 'v@x.io',
    portal_access_token: TOKEN, clocked_in_at: null, shift_response: null, ...v,
  }
  h.db = createFakeDb(
    {
      volunteers: [volunteer],
      registrations: [
        { id: 'r1', event_id: 'e1', user_id: 'att-1', qr_code: 'abc123', status: 'confirmed', attendee_name: 'Ann Lee', attendee_email: 'ann@x.com', ticket_types: { name: 'GA' }, check_ins: [] },
      ],
      check_ins: [],
    },
    opts.failWrite ? { failWrite: { volunteers: { code: 'XX000', message: 'boom' } } } : {},
  )
  h.db.client.rpc = vi.fn(async () => ({ data: h.db.tables.volunteers[0], error: null }))
}
const params = { params: Promise.resolve({ token: TOKEN }) }
const doCheckin = async () => {
  const res = await checkin(new Request('https://prezva.app/x', { method: 'POST', body: JSON.stringify({ qr_code: 'abc123' }) }), params)
  return { status: res.status, body: await res.json() }
}
const doClockIn = async () => {
  const res = await clockIn(new Request('https://prezva.app/x', { method: 'POST' }), params)
  return { status: res.status, body: await res.json() }
}
const doLookup = async () => {
  const res = await lookup(new NextRequest('https://prezva.app/x?q=Ann'), params)
  return { status: res.status, body: await res.json() }
}

const refused = [
  { name: 'status declined', v: { status: 'declined' } },
  { name: 'status no_show', v: { status: 'no_show' } },
  { name: 'shift_response declined', v: { status: 'invited', shift_response: 'declined' } },
]
const allowed = [
  { name: 'invited', v: { status: 'invited' } },
  { name: 'confirmed', v: { status: 'confirmed', shift_response: 'confirmed' } },
  { name: 'checked_in', v: { status: 'checked_in' } },
]

describe.each(refused)('refused: $name', ({ v }) => {
  beforeEach(() => setup(v))
  const inactive = { error: VOLUNTEER_INACTIVE_ERROR }

  it('door check-in is 403 and writes nothing', async () => {
    expect(await doCheckin()).toEqual({ status: 403, body: inactive })
    expect(h.db.tables.check_ins).toEqual([])
  })
  it('clock-in is 403 and does not un-decline', async () => {
    expect(await doClockIn()).toEqual({ status: 403, body: inactive })
    expect(h.db.tables.volunteers[0]).toMatchObject({ ...v, clocked_in_at: null })
  })
  it('lookup is 403 and returns no attendees', async () => {
    expect(await doLookup()).toEqual({ status: 403, body: inactive })
  })
})

describe.each(allowed)('allowed: $name', ({ v }) => {
  beforeEach(() => setup(v))

  it('door check-in keeps its response shape', async () => {
    expect(await doCheckin()).toEqual({ status: 200, body: { ok: true, already_checked_in: false, attendee_name: 'Ann Lee', ticket_type_name: 'GA' } })
  })
  it('clock-in keeps its response shape', async () => {
    const { status, body } = await doClockIn()
    expect(status).toBe(200)
    expect(Object.keys(body)).toEqual(['clocked_in_at'])
    expect(h.db.tables.volunteers[0].status).toBe('checked_in')
  })
  it('lookup keeps its response shape', async () => {
    const { status, body } = await doLookup()
    expect(status).toBe(200)
    expect(body.results[0]).toEqual({ id: 'r1', name: 'Ann Lee', email: 'ann@x.com', status: 'confirmed', ticket: 'GA', checked_in: false })
  })
})

it('token and role checks are unchanged and come first', async () => {
  setup({ status: 'declined' })
  h.db.client.rpc = vi.fn(async () => ({ data: null, error: null }))
  expect((await doCheckin()).status).toBe(401)
  setup({ status: 'invited' })
  h.db.tables.volunteers[0].role = 'general'
  expect(await doCheckin()).toEqual({ status: 403, body: { error: 'This volunteer role does not have check-in access' } })
})

it('isVolunteerActive', () => {
  expect(isVolunteerActive({ status: 'invited', shift_response: null })).toBe(true)
  expect(isVolunteerActive({ status: 'confirmed', shift_response: 'pending' })).toBe(true)
  expect(isVolunteerActive({ status: 'confirmed', shift_response: 'declined' })).toBe(false)
  expect(isVolunteerActive({ status: 'no_show' })).toBe(false)
})

describe('shift response write', () => {
  it('reports a failed write instead of claiming it saved', async () => {
    setup({ status: 'invited' }, { failWrite: true })
    const res = await respondToVolunteerShift(TOKEN, 'declined', 'sick')
    expect(res).toEqual({ error: 'Could not save your response. Please try again.' })
  })
  it('saves the response', async () => {
    setup({ status: 'invited' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')))
    const res = await respondToVolunteerShift(TOKEN, 'declined', 'sick')
    vi.unstubAllGlobals()
    expect(res).toEqual({ ok: true, response: 'declined' })
    expect(h.db.tables.volunteers[0]).toMatchObject({ shift_response: 'declined', shift_decline_reason: 'sick' })
  })
})
