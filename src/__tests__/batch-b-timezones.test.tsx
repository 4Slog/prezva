// Batch B commit 5 (O109 + R89). The browser/server process runs in
// America/Los_Angeles; every event is in America/New_York. Each input must
// store the NEW YORK reading of the wall clock typed, and read back the same.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => {
  process.env.TZ = 'America/Los_Angeles'
  return { db: null as any }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'user-1' })),
  getUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(async () => {}),
  hasPermission: vi.fn(async () => true),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => ({ value: 'embed-token' })) })),
}))
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn(async () => ({ location_id: 'loc-1' })),
  COOKIE_NAME: 'embed_session',
}))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), redirect: vi.fn() }))
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())
vi.mock('@/lib/ratelimit', async () => (await import('./helpers/auto-mock')).autoMockModule({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9 })),
}))
vi.mock('@/lib/video/actions', async () => (await import('./helpers/auto-mock')).autoMockModule({
  updateSimuliveSchedule: vi.fn(async () => ({ ok: true })),
}))

import { upsertRosItem } from '@/lib/events/run-of-show-actions'
import { embedUpsertRosItem } from '@/lib/embedded/run-of-show-actions'
import { POST as addVolunteer } from '@/app/api/events/[id]/volunteers/route'
import { embedAddVolunteer } from '@/lib/embedded/volunteers-actions'
import { createTicketType } from '@/lib/registration/ticket-actions'
import { createDiscountCode } from '@/lib/events/discount-actions'
import { createCommunityPost, sendMeetingRequest } from '@/lib/networking/sprint8-actions'
import { updateSimuliveSchedule } from '@/lib/video/actions'
import { enqueueVolunteerInvite } from '@/lib/trigger'
import RecordingSection from '@/app/(dashboard)/events/[slug]/sessions/[sessionId]/settings/RecordingSection'
import { MeetingResponsePanel } from '@/components/networking/MeetingResponsePanel'
import {
  isoToZonedInput, resolveEditedInstant, endOfZonedDateIso, isoToZonedDate,
  formatInZone, formatProposedTime, zoneName,
} from '@/lib/datetime/zoned-input'

const NY = 'America/New_York'
const EVENT = 'e0000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  h.db = createFakeDb({
    events: [{ id: EVENT, org_id: 'org-1', slug: 'ev', title: 'Expo', start_at: '2026-10-06T13:00:00Z', timezone: NY }],
    ghl_location_links: [{ ghl_location_id: 'loc-1', org_id: 'org-1' }],
    run_of_show_items: [],
    volunteers: [],
    ticket_types: [],
    discount_codes: [],
    community_posts: [],
    meeting_requests: [],
  })
})

const last = (table: string) => h.db.tables[table].at(-1)

describe('the test process really is in Los Angeles', () => {
  it('a naive Date parse reads Pacific (the bug this batch fixes)', () => {
    expect(new Date('2026-10-06T15:00').toISOString()).toBe('2026-10-06T22:00:00.000Z')
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/Los_Angeles')
  })
})

describe('O109: each input stores the event-zone reading and round-trips', () => {
  const roundTrips = (stored: string, typed: string) => expect(isoToZonedInput(stored, NY)).toBe(typed)

  it('run of show time_at (dashboard + embedded)', async () => {
    expect(await upsertRosItem(EVENT, { time_at: '2026-10-06T15:00', duration_minutes: 10, title: 'Doors' })).toEqual({ ok: true })
    expect(last('run_of_show_items').time_at).toBe('2026-10-06T19:00:00.000Z')
    roundTrips(last('run_of_show_items').time_at, '2026-10-06T15:00')

    expect(await embedUpsertRosItem(EVENT, { time_at: '2026-10-06T16:30', duration_minutes: 10, title: 'Keynote' })).toEqual({ ok: true })
    expect(last('run_of_show_items').time_at).toBe('2026-10-06T20:30:00.000Z')
  })

  it('volunteer shift_start / shift_end (API route + embedded), invite carries the zone', async () => {
    const req = new Request('http://x', { method: 'POST', body: JSON.stringify({
      event_id: EVENT, name: 'Val', email: 'v@x.io', role: 'general',
      shift_start: '2026-10-06T09:00', shift_end: '2026-10-06T17:00',
    }) })
    const res = await addVolunteer(req, { params: Promise.resolve({ id: 'ev' }) } as any)
    expect(res.status).toBe(200)
    expect(last('volunteers')).toMatchObject({ shift_start: '2026-10-06T13:00:00.000Z', shift_end: '2026-10-06T21:00:00.000Z' })
    roundTrips(last('volunteers').shift_start, '2026-10-06T09:00')
    expect(enqueueVolunteerInvite).toHaveBeenCalledWith(expect.objectContaining({ eventTimezone: NY }))

    const r2 = await embedAddVolunteer(EVENT, { name: 'Eve', email: 'e@x.io', phone: '', role: 'general', shift_start: '2026-10-06T08:15', shift_end: '', notes: '' })
    expect(r2).toHaveProperty('volunteer')
    expect(last('volunteers')).toMatchObject({ shift_start: '2026-10-06T12:15:00.000Z', shift_end: null })
  })

  it('ticket sale window accepts the datetime-local value (was refused) and converts in the event zone', async () => {
    const fd = new FormData()
    fd.set('name', 'GA')
    fd.set('type', 'free')
    fd.set('sale_starts_at', '2026-09-01T09:00')
    fd.set('sale_ends_at', '2026-10-05T23:59')
    const res = await createTicketType(EVENT, fd)
    expect(res).not.toHaveProperty('error')
    expect(last('ticket_types')).toMatchObject({ sale_starts_at: '2026-09-01T13:00:00.000Z', sale_ends_at: '2026-10-06T03:59:00.000Z' })
    roundTrips(last('ticket_types').sale_ends_at, '2026-10-05T23:59')
  })

  it('ticket sale end before start is refused', async () => {
    const fd = new FormData()
    fd.set('name', 'GA')
    fd.set('sale_starts_at', '2026-10-05T10:00')
    fd.set('sale_ends_at', '2026-10-05T09:00')
    expect(await createTicketType(EVENT, fd)).toHaveProperty('error')
    expect(h.db.tables.ticket_types).toEqual([])
  })

  it('discount valid_until is the END of the chosen date, event-local (23:59:59.999)', async () => {
    const res = await createDiscountCode(EVENT, { code: 'EARLY', discount_type: 'percent', discount_value: 10, valid_until: '2026-10-06' })
    expect(res).toHaveProperty('data')
    const stored = last('discount_codes').valid_until
    expect(stored).toBe('2026-10-07T03:59:59.999Z')
    expect(new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: 'h23', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions).format(new Date(stored))).toBe('23:59:59.999')
    expect(isoToZonedDate(stored, NY)).toBe('2026-10-06')
  })

  it('community meetup starts_at', async () => {
    await createCommunityPost(EVENT, { post_type: 'meetup', body: 'Coffee', starts_at: '2026-10-06T18:30' })
    expect(last('community_posts').starts_at).toBe('2026-10-06T22:30:00.000Z')
    roundTrips(last('community_posts').starts_at, '2026-10-06T18:30')
  })

  it('simulive: saves the typed wall clock in the event zone and shows the zone by name', async () => {
    const view = render(
      <RecordingSection sessionId="s1" eventSlug="ev" eventTimezone={NY} initialRecordingEnabled initialAllowRewatch={false}
        initialMuxAssetId="a1" initialMuxAssetPlaybackId="p1" initialSimuliveScheduledAt={null} hasMuxStream={false} />,
    )
    expect(screen.getByText(/Broadcast at \(Eastern Time\)/)).toBeTruthy()
    fireEvent.change(view.container.querySelector('#simulive-broadcast-at')!, { target: { value: '2026-10-06T15:00' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /schedule/i })) })
    expect(updateSimuliveSchedule).toHaveBeenCalledWith('s1', '2026-10-06T19:00:00.000Z', 'ev')
    expect(await screen.findByText(/Scheduled for Oct 6, 2026, 3:00 PM Eastern Time/)).toBeTruthy()
  })

  it('an untouched pre-filled value resaves to the same stored instant (R83)', () => {
    for (const stored of ['2026-10-06T19:00:00.000Z', '2026-11-01T05:30:00.000Z', '2026-03-08T07:30:00.000Z']) {
      const shown = isoToZonedInput(stored, NY)
      expect(resolveEditedInstant(shown, stored, NY, NY)).toBe(stored)
      expect(resolveEditedInstant(`${shown}:00`, stored, NY, NY)).toBe(stored)
    }
  })

  it('displays name the event zone', () => {
    expect(zoneName(NY)).toBe('Eastern Time')
    expect(formatInZone('2026-10-06T19:00:00.000Z', NY)).toBe('Tue, Oct 6, 3:00 PM Eastern Time')
  })
})

describe('endOfZonedDateIso', () => {
  it('is the next local midnight minus 1 ms, across DST and in UTC', () => {
    expect(endOfZonedDateIso('2026-10-06', NY)).toBe('2026-10-07T03:59:59.999Z')
    expect(endOfZonedDateIso('2026-01-15', NY)).toBe('2026-01-16T04:59:59.999Z')
    // The day DST ends in New York (25 hours long).
    expect(endOfZonedDateIso('2026-11-01', NY)).toBe('2026-11-02T04:59:59.999Z')
    expect(endOfZonedDateIso('2026-10-06', 'UTC')).toBe('2026-10-06T23:59:59.999Z')
    expect(() => endOfZonedDateIso('2026-02-30', NY)).toThrow()
  })
})

describe('R89 meeting requests', () => {
  const AT = '2026-10-06T19:00:00.000Z' // 3:00 PM Eastern, 12:00 PM Pacific

  it('same zone: one time, named', () => {
    expect(formatProposedTime({ at: AT, tz: NY }, NY)).toBe('Tue Oct 6, 3:00 PM Eastern')
    // A zone that reads identically (Detroit is Eastern too) is not "different".
    expect(formatProposedTime({ at: AT, tz: NY }, 'America/Detroit')).toBe('Tue Oct 6, 3:00 PM Eastern')
  })

  it('cross zone: proposed time in its zone plus the viewer\'s local time', () => {
    expect(formatProposedTime({ at: AT, tz: NY }, 'America/Los_Angeles'))
      .toBe('Tue Oct 6, 3:00 PM Eastern — 12:00 PM your time (Pacific)')
  })

  it('cross zone across midnight names the viewer\'s day', () => {
    expect(formatProposedTime({ at: '2026-10-07T03:30:00.000Z', tz: 'America/Los_Angeles' }, NY))
      .toBe('Tue Oct 6, 8:30 PM Pacific — 11:30 PM your time (Eastern)')
    expect(formatProposedTime({ at: '2026-10-07T05:30:00.000Z', tz: 'America/Los_Angeles' }, NY))
      .toBe('Tue Oct 6, 10:30 PM Pacific — Wed Oct 7, 1:30 AM your time (Eastern)')
  })

  it('legacy naive strings display as-is, flagged', () => {
    expect(formatProposedTime('2026-10-06T15:00', 'America/Los_Angeles')).toBe('2026-10-06T15:00 (time zone not recorded)')
  })

  it('sendMeetingRequest stores { at, tz } and refuses a bare string', async () => {
    const RECIPIENT = '00000000-0000-4000-8000-0000000000aa'
    expect(await sendMeetingRequest(EVENT, { recipient_id: RECIPIENT, proposed_times: ['2026-10-06T15:00'] })).toHaveProperty('error')
    expect(h.db.tables.meeting_requests).toEqual([])
    expect(await sendMeetingRequest(EVENT, { recipient_id: RECIPIENT, proposed_times: [{ at: '2026-10-06T19:00:00Z', tz: NY }] })).toEqual({ success: true })
    expect(last('meeting_requests').proposed_times).toEqual([{ at: AT, tz: NY }])
  })

  it('the recipient panel shows proposed zone + their own time (browser in LA), and legacy rows', async () => {
    render(
      <MeetingResponsePanel requestId="m1" requesterName="Ann" requesterAvatarUrl={null} requesterHandle={null}
        message={null} proposedTimes={[{ at: AT, tz: NY }, '2026-10-06T15:00']} initialStatus="pending" />,
    )
    expect(await screen.findByText('• Tue Oct 6, 3:00 PM Eastern — 12:00 PM your time (Pacific)')).toBeTruthy()
    expect(screen.getByText('• 2026-10-06T15:00 (time zone not recorded)')).toBeTruthy()
  })
})
