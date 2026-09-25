// @vitest-environment node
// Batch C commit 1b: polls, SMS count, trivia points, wallet pass, dead-letter
// routes, my-agenda calendar and /api/upload. Each refuses a stranger /
// wrong-event / wrong-token caller and writes (or returns) nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, allowed: new Set<string>(), user: null as any, uploads: [] as string[] }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'user-1' })),
  getUser: vi.fn(async () => ({ id: 'user-1' })),
}))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  return {
    assertPermission: vi.fn(async (org: string, _u: string, key: string) => {
      if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
    }),
  }
})
vi.mock('@/lib/passes/google-wallet', () => ({ generateGoogleWalletUrl: vi.fn(async () => ({ url: 'https://pay.google.com/gp/v/save/x' })) }))
vi.mock('telnyx', () => ({ default: vi.fn() }))

import { createPoll, getPollsForSession } from '@/lib/engagement/poll-actions'
import { getSMSEligibleCount } from '@/lib/announcements/sms-actions'
import { submitTriviaAnswer } from '@/lib/engagement/sprint10-actions'
import { GET as googlePass } from '@/app/api/passes/google/[registrationId]/route'
import { POST as deadLetter } from '@/app/api/dead-letter/route'
import { POST as resolveLetter } from '@/app/api/events/[id]/dead-letters/[letterId]/resolve/route'
import { GET as agendaIcs } from '@/app/api/events/[id]/my-agenda/calendar.ics/route'
import { POST as upload } from '@/app/api/upload/route'
import { generateGoogleWalletUrl } from '@/lib/passes/google-wallet'

beforeEach(() => {
  vi.clearAllMocks()
  h.allowed = new Set()
  h.user = null
  h.uploads = []
  h.db = createFakeDb({
    events: [
      { id: 'e1', org_id: 'orgA', slug: 'ev-a', title: 'A' },
      { id: 'e2', org_id: 'orgB', slug: 'ev-b', title: 'B' },
    ],
    sessions: [
      { id: 's-a', event_id: 'e1', is_published: true, title: 'Opening', starts_at: '2026-10-01T14:00:00Z', ends_at: '2026-10-01T15:00:00Z' },
      { id: 's-b', event_id: 'e2', is_published: true, title: 'Other', starts_at: '2026-10-01T14:00:00Z', ends_at: '2026-10-01T15:00:00Z' },
      { id: 's-draft', event_id: 'e1', is_published: false, title: 'Secret draft', starts_at: '2026-10-01T16:00:00Z', ends_at: '2026-10-01T17:00:00Z' },
    ],
    session_polls: [{ id: 'p-b', session_id: 's-b', event_id: 'e2', options: ['x', 'y'], session_poll_votes: [] }],
    registrations: [
      { id: 'reg-a', event_id: 'e1', qr_code: 'QR-A', status: 'confirmed', user_id: null, attendee_email: 'ann@x.test', sms_opt_in: true, attendee_phone: '+1555' },
      { id: 'reg-b', event_id: 'e2', qr_code: 'QR-B', status: 'confirmed', user_id: 'user-b', attendee_email: 'ben@x.test' },
    ],
    trivia_questions: [
      { id: 'tq-a', event_id: 'e1', correct_index: 1, points: 10 },
      { id: 'tq-a2', event_id: 'e1', correct_index: 0, points: 10 },
    ],
    trivia_answers: [],
    leaderboard_points: [],
    dead_letter_items: [
      { id: 'dl-a', event_id: 'e1', resolved_at: null },
      { id: 'dl-b', event_id: 'e2', resolved_at: null },
    ],
    // Real shape: (user_id, session_id) only; the event is reached through the
    // sessions!inner embed, which the fake reads from the nested object.
    session_bookmarks: [
      { user_id: 'user-b', session_id: 's-a', sessions: { event_id: 'e1' } },
      { user_id: 'user-b', session_id: 's-draft', sessions: { event_id: 'e1' } },
    ],
    speakers: [{ id: 'sp-b', event_id: 'e2' }],
    event_sponsors: [{ id: 'spon-b', event_id: 'e2' }],
    org_speakers: [],
    org_members: [{ org_id: 'orgA', user_id: 'user-1', role: 'admin' }],
  }, {
    unique: {
      leaderboard_points: (a, b) => a.event_id === b.event_id && a.registration_id === b.registration_id && a.action === b.action && !!b.registration_id,
      trivia_answers: (a, b) => a.question_id === b.question_id && a.user_id === b.user_id,
    },
  })
  h.db.client.auth = { getUser: vi.fn(async () => ({ data: { user: h.user } })) }
  h.db.client.storage = {
    from: vi.fn(() => ({
      upload: vi.fn(async (path: string) => { h.uploads.push(path); return { data: { path }, error: null } }),
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn/${path}` } })),
    })),
  }
})
afterEach(() => { delete process.env.CRON_SECRET })

const noWrites = () => expect(h.db.writes.filter((w: any) => w.matched > 0)).toEqual([])
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })

describe('engagement polls', () => {
  it('createPoll: a stranger, or org A on org B\'s session, writes nothing', async () => {
    expect(await createPoll('s-a', 'e1', 'Q?', ['a', 'b'])).toHaveProperty('error')
    h.allowed.add('orgA:agenda.manage')
    expect(await createPoll('s-b', 'e2', 'Q?', ['a', 'b'])).toHaveProperty('error')
    noWrites()
  })

  it('createPoll: the session decides the event — a mismatched eventId is refused', async () => {
    h.allowed.add('orgA:agenda.manage')
    expect(await createPoll('s-a', 'e2', 'Q?', ['a', 'b'])).toHaveProperty('error')
    noWrites()
    expect(await createPoll('s-a', 'e1', 'Q?', ['a', 'b'])).not.toHaveProperty('error')
    expect(h.db.writesTo('session_polls')[0].values).toMatchObject({ session_id: 's-a', event_id: 'e1' })
  })

  it('getPollsForSession needs agenda.view on the session\'s event', async () => {
    expect(await getPollsForSession('s-b')).toEqual([])
    h.allowed.add('orgA:agenda.view')
    expect(await getPollsForSession('s-b')).toEqual([])
    h.allowed.add('orgB:agenda.view')
    expect((await getPollsForSession('s-b')).length).toBe(1)
  })
})

describe('SMS eligible count', () => {
  it('returns 0 without announcements.send on the event\'s org', async () => {
    expect(await getSMSEligibleCount('e1')).toBe(0)
    h.allowed.add('orgA:announcements.send')
    expect(await getSMSEligibleCount('e1')).toBe(1)
  })
})

describe('trivia points', () => {
  it('a guest must present a registration token for the question\'s event', async () => {
    expect(await submitTriviaAnswer('tq-a', 1)).toHaveProperty('error')
    expect(await submitTriviaAnswer('tq-a', 1, 'QR-B')).toHaveProperty('error')
    expect(await submitTriviaAnswer('tq-a', 1, 'reg-a')).toHaveProperty('error')
    noWrites()
  })

  it('a guest with their token earns points once, on their own registration', async () => {
    const first = await submitTriviaAnswer('tq-a', 1, 'QR-A')
    expect(first).toMatchObject({ correct: true, points: 10 })
    expect(h.db.writesTo('leaderboard_points')[0].values).toMatchObject({ event_id: 'e1', registration_id: 'reg-a', action: 'trivia_correct' })
    const again = await submitTriviaAnswer('tq-a', 1, 'QR-A')
    expect(again).toMatchObject({ correct: true, points: 0 })
    expect(h.db.writesTo('leaderboard_points')).toHaveLength(1)
  })

  it('a signed-in caller without a registration for the event earns nothing', async () => {
    h.user = { id: 'user-b', email: 'ben@x.test' }
    expect(await submitTriviaAnswer('tq-a', 1)).toHaveProperty('error')
    noWrites()
  })

  it('a signed-in attendee answers a question once', async () => {
    h.user = { id: 'user-a', email: 'ann@x.test' }
    expect(await submitTriviaAnswer('tq-a', 1)).toMatchObject({ correct: true })
    expect(await submitTriviaAnswer('tq-a', 1)).toMatchObject({ error: 'Already answered' })
    expect(h.db.writesTo('trivia_answers')).toHaveLength(1)
  })
})

describe('Google Wallet pass', () => {
  const req = (q = '') => new NextRequest(`http://x/api/passes/google/reg-a${q}`)

  it('no token and no login → 404, no pass generated', async () => {
    expect((await googlePass(req(), params({ registrationId: 'reg-a' }))).status).toBe(404)
    expect((await googlePass(req('?t=QR-B'), params({ registrationId: 'reg-a' }))).status).toBe(404)
    h.user = { id: 'user-b', email: 'ben@x.test' }
    expect((await googlePass(req(), params({ registrationId: 'reg-a' }))).status).toBe(404)
    expect(generateGoogleWalletUrl).not.toHaveBeenCalled()
  })

  it('the registration\'s own token, or the owner\'s login, gets the pass', async () => {
    expect((await googlePass(req('?t=QR-A'), params({ registrationId: 'reg-a' }))).status).toBe(307)
    h.user = { id: 'someone', email: 'ANN@x.test' }
    expect((await googlePass(req(), params({ registrationId: 'reg-a' }))).status).toBe(307)
  })
})

describe('dead-letter routes', () => {
  const post = (headers: Record<string, string> = {}) => new Request('http://x/api/dead-letter', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ type: 't', payload: {} }),
  })

  it('POST /api/dead-letter refuses without the internal secret (and when it is unset)', async () => {
    expect((await deadLetter(post())).status).toBe(401)
    expect((await deadLetter(post({ authorization: 'Bearer guess' }))).status).toBe(401)
    process.env.CRON_SECRET = 's3cret'
    expect((await deadLetter(post({ authorization: 'Bearer wrong!' }))).status).toBe(401)
    noWrites()
    expect((await deadLetter(post({ authorization: 'Bearer s3cret' }))).status).toBe(200)
  })

  it('resolve: stranger and wrong-event are refused, nothing written', async () => {
    expect((await resolveLetter(new Request('http://x'), params({ id: 'ev-a', letterId: 'dl-a' }))).status).toBe(403)
    h.allowed.add('orgA:failed_jobs.manage')
    expect((await resolveLetter(new Request('http://x'), params({ id: 'ev-a', letterId: 'dl-b' }))).status).toBe(404)
    expect((await resolveLetter(new Request('http://x'), params({ id: 'ev-b', letterId: 'dl-b' }))).status).toBe(403)
    noWrites()
  })

  it('resolve: failed_jobs.manage on the item\'s event resolves it (slug or id in the URL)', async () => {
    h.allowed.add('orgA:failed_jobs.manage')
    expect((await resolveLetter(new Request('http://x'), params({ id: 'ev-a', letterId: 'dl-a' }))).status).toBe(200)
    expect(h.db.writesTo('dead_letter_items')).toHaveLength(1)
  })
})

describe('my-agenda calendar', () => {
  it('ignores ?userId and requires a login', async () => {
    const res = await agendaIcs(new Request('http://x/cal.ics?userId=user-b'), params({ id: 'e1' }))
    expect(res.status).toBe(401)
  })

  it('serves only the signed-in caller\'s bookmarks', async () => {
    h.user = { id: 'user-a' }
    const mine = await (await agendaIcs(new Request('http://x/cal.ics?userId=user-b'), params({ id: 'e1' }))).text()
    expect(mine).not.toContain('VEVENT')
  })

  it('the owner gets their bookmarked sessions of this event (no bookmarks.event_id)', async () => {
    h.user = { id: 'user-b' }
    const res = await agendaIcs(new Request('http://x/cal.ics'), params({ id: 'e1' }))
    expect(res.status).toBe(200)
    const ics = await res.text()
    expect(ics).toContain('SUMMARY:Opening')
    // A bookmark on a draft session never exposes it.
    expect(ics).not.toContain('Secret draft')
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    const bm = h.db.client.from.mock.results.find((_r: any, i: number) => h.db.client.from.mock.calls[i][0] === 'session_bookmarks')!.value
    expect(bm.eq).not.toHaveBeenCalledWith('event_id', expect.anything())
    expect(bm.eq).toHaveBeenCalledWith('sessions.event_id', 'e1')
  })

  it('a bookmark on another event\'s session is not included', async () => {
    h.user = { id: 'user-b' }
    const ics = await (await agendaIcs(new Request('http://x/cal.ics'), params({ id: 'e2' }))).text()
    expect(ics).not.toContain('VEVENT')
  })
})

describe('/api/upload', () => {
  const form = (type: string, entityId: string, orgId = 'orgA') => {
    const fd = new FormData()
    fd.append('file', new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))
    fd.append('type', type)
    fd.append('entityId', entityId)
    fd.append('orgId', orgId)
    return new NextRequest('http://x/api/upload', { method: 'POST', body: fd })
  }

  it('refuses an entity outside the caller\'s org, or a non-row id, and stores nothing', async () => {
    for (const [type, id] of [['org-logo', 'orgB'], ['event-cover', 'e2'], ['venue-map', '../../e1'], ['speaker-photo', 'sp-b'], ['sponsor-logo', 'spon-b']]) {
      expect((await upload(form(type, id))).status).toBe(403)
    }
    expect(h.uploads).toEqual([])
  })

  it('accepts the caller\'s own org and event', async () => {
    expect((await upload(form('org-logo', 'orgA'))).status).toBe(200)
    expect((await upload(form('event-cover', 'e1'))).status).toBe(200)
    expect(h.uploads).toHaveLength(2)
  })
})
