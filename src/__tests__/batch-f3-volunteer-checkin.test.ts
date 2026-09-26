// Batch F3 (O153, F-R14): volunteer door check-ins go through the shared door
// check-in — R90 refusals with guidance, door-once, audit with the volunteer
// as actor, points, source 'volunteer', case-insensitive QR — and the portal's
// JSON response shape is unchanged.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
  logAudit: vi.fn(async () => undefined),
  awardPoints: vi.fn(async () => 10),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/audit/log', () => ({ logAudit: h.logAudit }))
vi.mock('@/lib/engagement/points', () => ({ awardPoints: h.awardPoints }))

import { POST } from '@/app/api/volunteer/[token]/checkin/route'

const VOLUNTEER = { id: 'vol-1', event_id: 'e1', role: 'check-in', user_id: 'vol-user' }

function setup(status = 'confirmed', checkIns: Record<string, unknown>[] = [], volunteer: Record<string, unknown> = VOLUNTEER) {
  h.db = createFakeDb(
    {
      registrations: [
        { id: 'r1', event_id: 'e1', user_id: 'att-1', qr_code: 'abc123', status, attendee_name: 'Ann Lee', attendee_email: 'ann@x.com', ticket_types: { name: 'GA' } },
        { id: 'r2', event_id: 'e2', user_id: 'att-2', qr_code: 'other', status: 'confirmed', attendee_name: 'Ben', attendee_email: 'b@x.com', ticket_types: { name: 'VIP' } },
      ],
      check_ins: checkIns,
    },
    { unique: { check_ins: (a, b) => a.registration_id === b.registration_id && a.session_id == null && b.session_id == null } },
  )
  h.db.client.rpc = vi.fn(async () => ({ data: volunteer, error: null }))
}

async function scan(qr: string) {
  const res = await POST(
    new Request('https://prezva.app/api/volunteer/t/checkin', { method: 'POST', body: JSON.stringify({ qr_code: qr }) }),
    { params: Promise.resolve({ token: 't' }) },
  )
  return { status: res.status, body: await res.json() }
}

beforeEach(() => {
  h.logAudit.mockClear()
  h.awardPoints.mockClear()
})

describe('volunteer door check-in', () => {
  it('checks in with source volunteer, the volunteer as checked_in_by, audit and points; shape unchanged', async () => {
    setup()
    const { status, body } = await scan('ABC123') // case-insensitive
    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, already_checked_in: false, attendee_name: 'Ann Lee', ticket_type_name: 'GA' })

    expect(h.db.tables.check_ins).toHaveLength(1)
    expect(h.db.tables.check_ins[0]).toMatchObject({
      registration_id: 'r1', event_id: 'e1', checked_in_by: 'vol-user', checked_in_source: 'volunteer', method: 'qr_scan',
    })
    expect(h.db.tables.check_ins[0].session_id ?? null).toBeNull()

    expect(h.logAudit).toHaveBeenCalledTimes(1)
    const [, orgId, actorId, action, entity, entityId, meta, scope] = h.logAudit.mock.calls[0] as unknown[]
    expect({ orgId, actorId, action, entity, entityId, scope }).toEqual({
      orgId: null, actorId: 'vol-user', action: 'checkin.scan', entity: 'registrations', entityId: 'r1', scope: { eventId: 'e1' },
    })
    expect(meta).toMatchObject({ method: 'qr_scan', via: 'volunteer', volunteer_id: 'vol-1' })

    expect(h.awardPoints).toHaveBeenCalledWith('e1', 'att-1', 'checkin')
  })

  it('a volunteer without a user account is audited by volunteer id', async () => {
    setup('confirmed', [], { ...VOLUNTEER, user_id: null })
    await scan('abc123')
    expect(h.db.tables.check_ins[0].checked_in_by).toBeNull()
    const [, , actorId, , , , meta] = h.logAudit.mock.calls[0] as unknown[]
    expect(actorId).toBeNull()
    expect(meta).toMatchObject({ volunteer_id: 'vol-1' })
  })

  it('door-once: a second scan is "already checked in" with the real time, no second row, audit or points', async () => {
    setup('confirmed', [{ id: 'c1', registration_id: 'r1', event_id: 'e1', session_id: null, checked_in_at: '2026-10-01T14:00:00Z' }])
    const { status, body } = await scan('abc123')
    expect(status).toBe(200)
    expect(body).toEqual({
      ok: true, already_checked_in: true, attendee_name: 'Ann Lee', ticket_type_name: 'GA', checked_in_at: '2026-10-01T14:00:00Z',
    })
    expect(h.db.tables.check_ins).toHaveLength(1)
    expect(h.logAudit).not.toHaveBeenCalled()
    expect(h.awardPoints).not.toHaveBeenCalled()
  })

  it('a session check-in does not count as the door check-in', async () => {
    setup('confirmed', [{ id: 'c1', registration_id: 'r1', event_id: 'e1', session_id: 's1', checked_in_at: 'x' }])
    expect((await scan('abc123')).body.already_checked_in).toBe(false)
  })

  it.each([
    ['cancelled', 'Do not admit Ann Lee: Registration is cancelled. Send them to the registration desk.'],
    ['refunded', 'Do not admit Ann Lee: Registration was refunded. Send them to the registration desk.'],
    ['pending', 'Do not admit Ann Lee: Registration is pending. Awaiting approval — not yet admitted.'],
    ['waitlisted', 'Do not admit Ann Lee: Registration is on the waitlist. No ticket — waitlisted only.'],
  ])('R90: %s is refused with guidance and nothing is written', async (status, message) => {
    setup(status)
    const res = await scan('abc123')
    expect(res).toEqual({ status: 400, body: { error: message } })
    expect(h.db.writes).toEqual([])
    expect(h.logAudit).not.toHaveBeenCalled()
  })

  it('a QR from another event is not found', async () => {
    setup()
    expect(await scan('OTHER')).toEqual({ status: 404, body: { error: 'QR code not found for this event' } })
    expect(h.db.writes).toEqual([])
  })

  it('a failed lookup is a retryable 500, not "QR code not found"', async () => {
    setup()
    const from = h.db.client.from
    h.db.client.from = vi.fn((t: string) => {
      const b = from(t)
      if (t === 'registrations') b.single = vi.fn(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }))
      return b
    })
    expect(await scan('abc123')).toEqual({ status: 500, body: { error: 'Could not look up this QR code. Please try again.' } })
    expect(h.db.writes).toEqual([])
  })

  it('records the volunteer email on the check-in', async () => {
    setup('confirmed', [], { ...VOLUNTEER, email: 'vol@x.com' })
    await scan('abc123')
    expect(h.db.tables.check_ins[0].checked_in_by_email).toBe('vol@x.com')
  })

  it('token and role checks are unchanged', async () => {
    setup('confirmed', [], { ...VOLUNTEER, role: 'usher' })
    expect((await scan('abc123')).status).toBe(403)
    h.db.client.rpc = vi.fn(async () => ({ data: null, error: null }))
    expect((await scan('abc123')).status).toBe(401)
    expect(h.db.writes).toEqual([])
  })
})
