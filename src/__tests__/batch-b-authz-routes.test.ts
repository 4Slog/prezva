// Batch B commit 1: volunteer API routes (O114), the volunteer portal check-in
// scope, and the dashboard check-in search permission.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as any,
  allowed: new Set<string>(),
  limited: false,
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'user-1' })),
  getUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  const check = async (org: string, _u: string, key: string) => {
    if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
  }
  return {
    assertPermission: vi.fn(check),
    hasPermission: vi.fn(async (o: string, u: string, k: string) => check(o, u, k).then(() => true, () => false)),
  }
})
vi.mock('@/lib/ratelimit', async () => (await import('./helpers/auto-mock')).autoMockModule({
  checkRateLimit: vi.fn(async () => ({ limited: h.limited, remaining: h.limited ? 0 : 9 })),
}))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/integrations/ghl/location', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/integrations/ghl/org-config', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { POST as addVolunteer } from '@/app/api/events/[id]/volunteers/route'
import { POST as checkinVolunteer } from '@/app/api/events/[id]/volunteers/[volunteerId]/checkin/route'
import { POST as resendVolunteer } from '@/app/api/events/[id]/volunteers/[volunteerId]/resend/route'
import { POST as portalCheckin } from '@/app/api/volunteer/[token]/checkin/route'
import { searchAttendeesForCheckIn } from '@/lib/checkin/actions'
import { enqueueVolunteerInvite } from '@/lib/trigger'

function seed() {
  h.db = createFakeDb({
    events: [
      { id: 'e1', org_id: 'orgA', slug: 'ev-a', title: 'A', start_at: '2026-10-06T19:00:00Z', timezone: 'America/New_York' },
      { id: 'e2', org_id: 'orgB', slug: 'ev-b', title: 'B', start_at: '2026-10-06T19:00:00Z', timezone: 'America/New_York' },
    ],
    volunteers: [
      { id: 'v1', event_id: 'e1', name: 'Val', email: 'v@x.io', role: 'check-in', status: 'invited', portal_access_token: 'pt1' },
      { id: 'v2', event_id: 'e2', name: 'Bob', email: 'b@x.io', role: 'check-in', status: 'invited', portal_access_token: 'pt2' },
    ],
    registrations: [
      { id: 'reg-a', event_id: 'e1', qr_code: 'QR-A', status: 'confirmed', attendee_name: 'Ann' },
      { id: 'reg-b', event_id: 'e2', qr_code: 'QR-B', status: 'confirmed', attendee_name: 'Ben' },
    ],
    check_ins: [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.allowed = new Set()
  h.limited = false
  seed()
})

const noWrites = () => expect(h.db.writes.filter((w: any) => w.matched > 0)).toEqual([])
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as any
const jsonReq = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) })
const addBody = { event_id: '00000000-0000-4000-8000-000000000001', name: 'New', email: 'n@x.io', role: 'general' }

describe('O114 volunteer routes', () => {
  it('add without volunteers.manage on the slug\'s org is 403 and inserts nothing', async () => {
    h.allowed.add('orgA:volunteers.manage')
    const res = await addVolunteer(jsonReq(addBody), ctx({ id: 'ev-b' }))
    expect(res.status).toBe(403)
    noWrites()
    expect(enqueueVolunteerInvite).not.toHaveBeenCalled()
  })

  it('add over the per-user limit is 429 and inserts nothing', async () => {
    h.allowed.add('orgA:volunteers.manage')
    h.limited = true
    const res = await addVolunteer(jsonReq(addBody), ctx({ id: 'ev-a' }))
    expect(res.status).toBe(429)
    noWrites()
  })

  it('permitted add inserts into the slug\'s event, not the body event_id', async () => {
    h.allowed.add('orgA:volunteers.manage')
    const res = await addVolunteer(jsonReq(addBody), ctx({ id: 'ev-a' }))
    expect(res.status).toBe(200)
    expect(h.db.tables.volunteers.at(-1)).toMatchObject({ event_id: 'e1', email: 'n@x.io' })
  })

  it('check-in of another event\'s volunteer through a permitted event URL is 404, nothing written', async () => {
    h.allowed.add('orgA:volunteers.manage')
    const res = await checkinVolunteer(new Request('http://x'), ctx({ id: 'ev-a', volunteerId: 'v2' }))
    expect(res.status).toBe(404)
    noWrites()
  })

  it('check-in without the permission on the volunteer\'s own event is 403', async () => {
    h.allowed.add('orgA:volunteers.manage')
    const res = await checkinVolunteer(new Request('http://x'), ctx({ id: 'ev-b', volunteerId: 'v2' }))
    expect(res.status).toBe(403)
    noWrites()
  })

  it('permitted check-in updates only that volunteer', async () => {
    h.allowed.add('orgA:volunteers.manage')
    const res = await checkinVolunteer(new Request('http://x'), ctx({ id: 'ev-a', volunteerId: 'v1' }))
    expect(res.status).toBe(200)
    expect(h.db.tables.volunteers.find((v: any) => v.id === 'v1').status).toBe('checked_in')
    expect(h.db.tables.volunteers.find((v: any) => v.id === 'v2').status).toBe('invited')
  })

  it('resend without permission is 403 and sends nothing; over the limit is 429', async () => {
    const res = await resendVolunteer(new Request('http://x'), ctx({ id: 'ev-a', volunteerId: 'v1' }))
    expect(res.status).toBe(403)
    h.allowed.add('orgA:volunteers.manage')
    h.limited = true
    const res2 = await resendVolunteer(new Request('http://x'), ctx({ id: 'ev-a', volunteerId: 'v1' }))
    expect(res2.status).toBe(429)
    expect(enqueueVolunteerInvite).not.toHaveBeenCalled()
  })
})

describe('volunteer portal check-in scope', () => {
  it('a QR from another event is not found and nothing is written', async () => {
    h.db.client.rpc.mockResolvedValue({ data: { id: 'v1', event_id: 'e1', role: 'check-in' }, error: null })
    const res = await portalCheckin(jsonReq({ qr_code: 'QR-B' }), ctx({ token: 'pt1' }))
    expect(res.status).toBe(404)
    noWrites()
  })

  it('a QR from the volunteer\'s own event checks in', async () => {
    h.db.client.rpc.mockResolvedValue({ data: { id: 'v1', event_id: 'e1', role: 'check-in' }, error: null })
    const res = await portalCheckin(jsonReq({ qr_code: 'QR-A' }), ctx({ token: 'pt1' }))
    expect(res.status).toBe(200)
    expect(h.db.tables.check_ins).toHaveLength(1)
  })
})

describe('dashboard check-in search', () => {
  it('requires checkin.manage', async () => {
    h.allowed.add('orgA:attendees.view')
    await expect(searchAttendeesForCheckIn('e1', 'ann')).rejects.toThrow()
  })

  it('passes the term through the quoted filter helper', async () => {
    h.allowed.add('orgA:checkin.manage')
    await searchAttendeesForCheckIn('e1', 'zz%,id.not.is.null')
    const builders = h.db.client.from.mock.results.map((r: any) => r.value)
    const orCall = builders.flatMap((b: any) => b.or.mock.calls)[0]
    expect(orCall[0]).toBe('attendee_name.ilike."%zz\\\\%,id.not.is.null%",attendee_email.ilike."%zz\\\\%,id.not.is.null%"')
  })
})
