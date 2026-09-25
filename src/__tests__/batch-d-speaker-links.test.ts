// Batch D commit 2 (O139, D-R3): speaker portal links are
// speakers.confirmation_token, valid while
//   now <= greatest(portal_token_expires_at, coalesce(end_at, start_at) + 30 days)
// An expired link is refused everywhere; renew / invite re-mint it for 7 days.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, allowed: new Set<string>() }))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/auth/assert-permission', async () => {
  const { PermissionError } = await import('@/lib/auth/permission-error')
  return {
    assertPermission: vi.fn(async (org: string, _u: string, key: string) => {
      if (!h.allowed.has(`${org}:${key}`)) throw new PermissionError(key)
    }),
  }
})
vi.mock('@/lib/trigger', async () => (await import('./helpers/auto-mock')).autoMockModule())

import { isSpeakerLinkExpired, speakerLinkExpiresAt, SPEAKER_LINK_EXPIRED_MESSAGE } from '@/lib/speaker/speaker-link'
import { getOrCreateSpeakerToken } from '@/lib/speaker/speaker-token'
import { validateSpeakerToken, confirmSpeakerSlot, declineSpeakerSlot, renewSpeakerToken, sendSpeakerInvite } from '@/lib/speaker/speaker-actions'

const DAY = 86_400_000
const NOW = new Date('2026-11-01T12:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const EVENT_END = '2026-10-10T22:00:00Z' // event ended 22 days before NOW

describe('the expiry rule', () => {
  const ev = { start_at: '2026-10-10T13:00:00Z', end_at: EVENT_END }

  it('is valid up to event end + 30 days and expired after', () => {
    const end = new Date(EVENT_END).getTime()
    expect(isSpeakerLinkExpired(null, ev, new Date(end + 30 * DAY - 1000))).toBe(false)
    expect(isSpeakerLinkExpired(null, ev, new Date(end + 30 * DAY))).toBe(false)
    expect(isSpeakerLinkExpired(null, ev, new Date(end + 30 * DAY + 1000))).toBe(true)
  })

  it('falls back to start_at when there is no end', () => {
    expect(speakerLinkExpiresAt(null, { start_at: '2026-10-10T13:00:00Z', end_at: null }).toISOString())
      .toBe(iso(new Date('2026-10-10T13:00:00Z').getTime() + 30 * DAY))
  })

  it('a stored expiry only ever extends the window (renewed link: 7 days)', () => {
    const late = new Date(new Date(EVENT_END).getTime() + 60 * DAY)
    const renewedUntil = iso(late.getTime() + 7 * DAY)
    expect(isSpeakerLinkExpired(renewedUntil, ev, new Date(late.getTime() + 6 * DAY))).toBe(false)
    expect(isSpeakerLinkExpired(renewedUntil, ev, new Date(late.getTime() + 8 * DAY))).toBe(true)
    // An old stored expiry never cuts the event window short.
    expect(isSpeakerLinkExpired('2020-01-01T00:00:00Z', ev, new Date(new Date(EVENT_END).getTime() + DAY))).toBe(false)
  })

  it('moving the event later keeps a backfilled link valid', () => {
    const backfilled = iso(new Date(EVENT_END).getTime() + 30 * DAY) // what 0156 wrote
    const moved = { start_at: '2026-12-01T13:00:00Z', end_at: '2026-12-01T22:00:00Z' }
    const afterOldWindow = new Date(new Date(EVENT_END).getTime() + 40 * DAY)
    expect(isSpeakerLinkExpired(backfilled, ev, afterOldWindow)).toBe(true)
    expect(isSpeakerLinkExpired(backfilled, moved, afterOldWindow)).toBe(false)
  })
})

describe('link consumers', () => {
  const speakerRow = (over: Record<string, any> = {}) => ({
    id: 'sp1', event_id: 'e1', name: 'Ann', email: 'ann@x.test', status: 'invited',
    confirmation_token: 'tok-live', portal_token_expires_at: null,
    events: { id: 'e1', title: 'Conf', slug: 'conf', start_at: '2026-10-10T13:00:00Z', end_at: EVENT_END },
    ...over,
  })
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    h.allowed = new Set(['orgA:speakers.manage'])
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    h.db = createFakeDb({
      events: [
        { id: 'e1', org_id: 'orgA', title: 'Conf', start_at: '2026-10-10T13:00:00Z', end_at: EVENT_END, organizations: { name: 'Org A' } },
      ],
      speakers: [
        speakerRow(),
        speakerRow({ id: 'sp2', confirmation_token: 'tok-old', events: { id: 'e1', title: 'Conf', slug: 'conf', start_at: '2026-08-01T13:00:00Z', end_at: '2026-08-01T22:00:00Z' } }),
      ],
      org_speakers: [],
    })
    h.db.client.auth = { admin: { generateLink: vi.fn(async () => ({ error: null })) } }
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  const sp = (id: string) => h.db.tables.speakers.find((r: any) => r.id === id)

  it('validateSpeakerToken: live link resolves, expired and unknown links do not', async () => {
    expect(await validateSpeakerToken('tok-live')).toMatchObject({ event_id: 'e1', speaker_id: 'sp1' })
    expect(await validateSpeakerToken('tok-old')).toBeNull()
    expect(await validateSpeakerToken('nope')).toBeNull()
  })

  it('confirm and decline refuse an expired link with the expired message and write nothing', async () => {
    expect(await confirmSpeakerSlot('tok-old', 'confirmed')).toEqual({ error: SPEAKER_LINK_EXPIRED_MESSAGE })
    expect(await declineSpeakerSlot('tok-old', 'busy')).toEqual({ error: SPEAKER_LINK_EXPIRED_MESSAGE })
    expect(h.db.writesTo('speakers')).toEqual([])
  })

  it('confirm on a live link updates that speaker only', async () => {
    expect(await confirmSpeakerSlot('tok-live', 'confirmed')).toEqual({ ok: true })
    expect(sp('sp1').status).toBe('confirmed')
    expect(sp('sp2').status).toBe('invited')
  })

  it('getOrCreateSpeakerToken returns a live token unchanged', async () => {
    expect(await getOrCreateSpeakerToken('sp1', { userId: 'user-1' })).toEqual({ token: 'tok-live', eventId: 'e1' })
    expect(h.db.writesTo('speakers')).toEqual([])
  })

  it('an organizer invite re-mints an expired token, valid for 7 days', async () => {
    // sp2's link: its row carries an old event; the minting reads the real event (ended 22 days ago).
    h.db.tables.speakers[1].events = speakerRow().events
    sp('sp2').portal_token_expires_at = '2026-09-01T00:00:00Z'
    // Move NOW past the event window so the token is expired.
    vi.setSystemTime(new Date(new Date(EVENT_END).getTime() + 31 * DAY))
    expect(await validateSpeakerToken('tok-old')).toBeNull()

    const res = await sendSpeakerInvite('e1', 'sp2')
    expect(res).not.toHaveProperty('error')
    const fresh = sp('sp2').confirmation_token
    expect(fresh).not.toBe('tok-old')
    expect(fresh).toMatch(/^[0-9a-f]{48}$/)
    expect(new Date(sp('sp2').portal_token_expires_at).getTime()).toBe(Date.now() + 7 * DAY)
    expect(await validateSpeakerToken(fresh)).toMatchObject({ speaker_id: 'sp2' })
    expect(await validateSpeakerToken('tok-old')).toBeNull()

    vi.setSystemTime(new Date(Date.now() + 8 * DAY))
    expect(await validateSpeakerToken(fresh)).toBeNull()
  })

  it('renew always rotates, emails the new link, and the old link stops working', async () => {
    const res = await renewSpeakerToken('sp1') as any
    expect(res.ok).toBe(true)
    expect(res.newToken).not.toBe('tok-live')
    expect(res.hubUrl).toContain(`/speaker/${res.newToken}`)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(await validateSpeakerToken('tok-live')).toBeNull()
    expect(await validateSpeakerToken(res.newToken)).toMatchObject({ speaker_id: 'sp1' })
  })

  it('renew reports an email failure instead of hiding it', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    const res = await renewSpeakerToken('sp1') as any
    expect(res.ok).toBe(true)
    expect(res.emailError).toMatch(/could not be sent/)
  })

  it('renew without speakers.manage returns an error and changes nothing', async () => {
    h.allowed = new Set()
    expect(await renewSpeakerToken('sp1')).toHaveProperty('error')
    expect(h.db.writesTo('speakers')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sp('sp1').confirmation_token).toBe('tok-live')
  })

  it('a re-mint whose event-filtered write hits no row is an error', async () => {
    const from = h.db.client.from
    h.db.client.from = vi.fn((t: string) => {
      const b = from(t)
      if (t === 'speakers') { const upd = b.update; b.update = vi.fn((v: any) => { upd(v); return b.eq('event_id', 'other') }) }
      return b
    })
    expect(await getOrCreateSpeakerToken('sp1', { userId: 'user-1' }, { rotate: true })).toEqual({ error: 'Speaker not found' })
  })
})
