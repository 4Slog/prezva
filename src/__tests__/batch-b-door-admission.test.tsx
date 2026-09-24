// Batch B commit 2 (O117 + R90): every door path admits CONFIRMED only, names
// the attendee and the reason on a refusal and writes nothing; a second door
// check-in (online, offline, or a race into check_ins_door_once) is "already
// checked in" and leaves one row.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'staff-1' })),
  getUser: vi.fn(async () => ({ id: 'staff-1' })),
}))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(async () => {}),
  hasPermission: vi.fn(async () => true),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: 'embed-token' })) })),
  headers: vi.fn(async () => new Headers()),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn(async () => ({ location_id: 'loc-1' })),
  COOKIE_NAME: 'embed_session',
}))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/integrations/ghl/org-config', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/integrations/ghl/location', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/email/deliver-attendee-email', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/stripe/server', async () => (await import('./helpers/auto-mock')).autoMockModule())

import * as dash from '@/lib/checkin/actions'
import * as embed from '@/lib/embedded/checkin-actions'
import { manualCheckIn } from '@/lib/registrations/actions'
import { DoorRefusalNotice } from '@/components/checkin/DoorRefusalNotice'
import { doorRefusal } from '@/lib/checkin/admission'

const EVENT = 'e0000000-0000-4000-8000-000000000001'
const REFUSED = [
  { status: 'pending',    reason: 'Registration is pending',         guidance: /awaiting approval/i },
  { status: 'waitlisted', reason: 'Registration is on the waitlist', guidance: /no ticket/i },
  { status: 'refunded',   reason: 'Registration was refunded',       guidance: /registration desk/i },
  { status: 'cancelled',  reason: 'Registration is cancelled',       guidance: /registration desk/i },
] as const

function seed(status: string, opts: { existingDoorRow?: boolean; raceDoorRow?: boolean } = {}) {
  const doorOnce = (a: any, b: any) => a.registration_id === b.registration_id && a.session_id == null && b.session_id == null
  h.db = createFakeDb({
    events: [{ id: EVENT, org_id: 'org-1', slug: 'ev' }],
    ghl_location_links: [{ ghl_location_id: 'loc-1', org_id: 'org-1' }],
    registrations: [{
      id: 'reg-1', event_id: EVENT, qr_code: 'qr-1', status, attendee_name: 'Dana Diaz',
      attendee_email: 'dana@x.io', user_id: null, ticket_types: { name: 'General' },
      events: { organizations: { id: 'org-1' } },
    }],
    check_ins: opts.existingDoorRow ? [{ id: 'ci-0', registration_id: 'reg-1', session_id: null, checked_in_at: '2026-10-06T19:00:00Z' }] : [],
  }, { unique: { check_ins: doorOnce } })
  if (opts.raceDoorRow) {
    // The lookup misses (another device inserts in between); the insert then hits the index.
    const realFrom = h.db.client.from.getMockImplementation()
    let lookedUp = false
    h.db.client.from.mockImplementation((t: string) => {
      const b = realFrom(t)
      if (t === 'check_ins' && !lookedUp) {
        lookedUp = true
        h.db.tables.check_ins.push({ id: 'ci-race', registration_id: 'reg-1', session_id: null })
        b.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
      }
      return b
    })
  }
}

const doorRows = () => h.db.tables.check_ins.filter((r: any) => r.registration_id === 'reg-1' && r.session_id == null)

type DoorCall = { name: string; run: () => Promise<{ success: boolean; error?: string; refusal?: any }> }
const DOOR_PATHS: DoorCall[] = [
  { name: 'dashboard QR', run: () => dash.checkInByQR(EVENT, 'qr-1') },
  { name: 'dashboard search', run: () => dash.checkInBySearch(EVENT, 'reg-1') },
  { name: 'embedded QR', run: () => embed.checkInByQR(EVENT, 'qr-1') },
  { name: 'embedded search', run: () => embed.checkInBySearch(EVENT, 'reg-1') },
]

beforeEach(() => vi.clearAllMocks())

describe.each(DOOR_PATHS)('door path: $name', ({ run }) => {
  it.each(REFUSED)('refuses $status with its reason, names the attendee, writes nothing', async ({ status, reason, guidance }) => {
    seed(status)
    const res = await run()
    expect(res.success).toBe(false)
    expect(res.refusal).toMatchObject({ kind: status, attendeeName: 'Dana Diaz', reason })
    expect(res.refusal.guidance).toMatch(guidance)
    expect(res.error).toContain('Do not admit Dana Diaz')
    expect(h.db.writesTo('check_ins')).toEqual([])
  })

  it('admits confirmed', async () => {
    seed('confirmed')
    const res = await run()
    expect(res.success).toBe(true)
    expect(doorRows()).toHaveLength(1)
  })

  it('a second door check-in is already-checked-in and leaves one row', async () => {
    seed('confirmed', { existingDoorRow: true })
    const res = await run() as any
    expect(res.success).toBe(true)
    expect(res.registration.already_checked_in).toBe(true)
    expect(doorRows()).toHaveLength(1)
  })

  it('a racing insert (23505 on check_ins_door_once) is already-checked-in, one row', async () => {
    seed('confirmed', { raceDoorRow: true })
    const res = await run() as any
    expect(res.success).toBe(true)
    expect(res.registration.already_checked_in).toBe(true)
    expect(doorRows()).toHaveLength(1)
  })
})

describe('attendee page manualCheckIn', () => {
  it.each(REFUSED)('refuses $status and writes nothing', async ({ status, reason }) => {
    seed(status)
    const res = await manualCheckIn('reg-1') as any
    expect(res.error).toContain(reason)
    expect(res.refusal.attendeeName).toBe('Dana Diaz')
    expect(h.db.writesTo('check_ins')).toEqual([])
  })

  it('race on the door index returns already checked in, one row', async () => {
    seed('confirmed', { raceDoorRow: true })
    expect(await manualCheckIn('reg-1')).toEqual({ ok: true, alreadyCheckedIn: true })
    expect(doorRows()).toHaveLength(1)
  })
})

describe('offline door sync inherits the allowlist', () => {
  const entry = (id: string) => ({ entryId: id, qr_code: 'qr-1', scanned_at: new Date(Date.now() - 60_000).toISOString() })

  it.each(REFUSED)('dashboard sync refuses $status, nothing written', async ({ status, reason }) => {
    seed(status)
    const res = await dash.processOfflineQueue({ eventId: EVENT, deviceId: 'd1', entries: [entry('11111111-1111-4111-8111-111111111111')] }) as any
    expect(res.results[0]).toMatchObject({ status: 'refused' })
    expect(res.results[0].reason).toContain(reason)
    expect(h.db.writesTo('check_ins')).toEqual([])
  })

  it('a replayed/raced offline entry is already_checked_in and leaves one row', async () => {
    seed('confirmed', { raceDoorRow: true })
    const res = await dash.processOfflineQueue({ eventId: EVENT, deviceId: 'd1', entries: [entry('22222222-2222-4222-8222-222222222222')] }) as any
    expect(res.results[0].status).toBe('already_checked_in')
    expect(doorRows()).toHaveLength(1)
  })
})

describe('R90 door UI', () => {
  it('shows a red Do not admit naming the attendee, the reason, and what to do', () => {
    render(<DoorRefusalNotice refusal={doorRefusal('refunded', 'Dana Diaz')!} />)
    const alert = screen.getByTestId('door-refusal')
    expect(alert).toHaveTextContent(/do not admit/i)
    expect(alert).toHaveTextContent('Dana Diaz — Registration was refunded')
    expect(alert).toHaveTextContent(/registration desk/i)
    expect(alert.className).toContain('bg-red-50')
  })

  it('confirmed has no refusal', () => {
    expect(doorRefusal('confirmed', 'Dana')).toBeNull()
  })
})
