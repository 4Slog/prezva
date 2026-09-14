// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/embedded/org-helpers', () => ({
  resolveOrgOwnerProfileId: vi.fn(async () => 'profile-owner-1'),
}))

import {
  ghlDollarStringToCents,
  resolveOrCreateEventFromGhl,
  resolveOrCreateTicketTypeForGhlEvent,
} from './events-bridge'

// Each entry is one `db.from(...)` call, in order. Chain methods all return the
// chain; the terminal (maybeSingle / single) resolves to what the step supplies.
function sequence(steps: Array<{ maybeSingle?: unknown; single?: unknown }>) {
  let i = 0
  const calls: any[] = []
  const from = vi.fn(() => {
    const step = (steps[i++] ?? {}) as any
    const chain: any = {}
    for (const k of ['select', 'eq', 'ilike', 'limit', 'insert', 'update']) {
      chain[k] = vi.fn().mockReturnValue(chain)
    }
    chain.maybeSingle = vi.fn().mockResolvedValue(step.maybeSingle ?? { data: null, error: null })
    chain.single = vi.fn().mockResolvedValue(step.single ?? { data: null, error: null })
    calls.push(chain)
    return chain
  })
  return { db: { from } as any, calls }
}

const ORG_ID = 'org-1'
const EVENT_ID = 'evt-1'

// ── ghlDollarStringToCents ────────────────────────────────────────────────────

describe('ghlDollarStringToCents', () => {
  // GHL Events sends money as a decimal-dollar STRING: "199" is $199.00, not 199c.
  it('reads "199" as $199.00, not as 199 cents', () => {
    expect(ghlDollarStringToCents('199')).toBe(19900)
  })

  it('keeps the cents on "199.50"', () => {
    expect(ghlDollarStringToCents('199.50')).toBe(19950)
  })

  it('reads "0" as zero rather than as absent', () => {
    expect(ghlDollarStringToCents('0')).toBe(0)
  })

  it('treats null and undefined and empty as a free ticket', () => {
    expect(ghlDollarStringToCents(null)).toBe(0)
    expect(ghlDollarStringToCents(undefined)).toBe(0)
    expect(ghlDollarStringToCents('')).toBe(0)
    expect(ghlDollarStringToCents('   ')).toBe(0)
  })

  // Unparseable is NOT zero. Number('abc') is NaN, and Math.round(NaN * 100) is
  // NaN — which would land in amount_paid_cents and book a paid seat at nothing.
  it('throws on a non-numeric string instead of quietly yielding 0 or NaN', () => {
    expect(() => ghlDollarStringToCents('not-money')).toThrow(/finite/)
  })

  it('throws on Infinity rather than passing it through', () => {
    expect(() => ghlDollarStringToCents('Infinity')).toThrow(/finite/)
  })

  it('rounds a float artefact to the nearest cent', () => {
    expect(ghlDollarStringToCents('0.1')).toBe(10)
    expect(ghlDollarStringToCents(19.99)).toBe(1999)
  })
})

// ── resolveOrCreateEventFromGhl ───────────────────────────────────────────────

describe('resolveOrCreateEventFromGhl', () => {
  beforeEach(() => vi.clearAllMocks())

  const CREATE_ARGS = {
    orgId: ORG_ID,
    ghlEventId: 'ghl-evt-99',
    title: 'Birmingham IEO',
    startAt: '2026-10-01T14:00:00Z',
    endAt: '2026-10-01T22:00:00Z',
  }

  it('returns the existing event without creating when ghl_event_id already maps', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: EVENT_ID, slug: 'birmingham-ieo' }, error: null } },
    ])

    const result = await resolveOrCreateEventFromGhl({
      db, ...CREATE_ARGS, timezone: 'America/Chicago',
    })

    expect(result).toEqual({ ok: true, eventId: EVENT_ID, slug: 'birmingham-ieo', created: false })
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  // A defaulted timezone is the failure mode this whole argument exists to stop.
  // An 8pm America/New_York event is the NEXT DAY in UTC, so falling back would
  // move every reminder and completion date by up to a day, invisibly.
  it('fails loud when the timezone is missing rather than defaulting to UTC', async () => {
    const { db, calls } = sequence([{ maybeSingle: { data: null, error: null } }])

    const result = await resolveOrCreateEventFromGhl({ db, ...CREATE_ARGS, timezone: undefined })

    expect(result).toEqual({ ok: false, error: 'event_timezone_missing' })
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  it('fails loud on an empty-string timezone', async () => {
    const { db } = sequence([{ maybeSingle: { data: null, error: null } }])
    const result = await resolveOrCreateEventFromGhl({ db, ...CREATE_ARGS, timezone: '   ' })
    expect(result).toEqual({ ok: false, error: 'event_timezone_missing' })
  })

  it('fails loud on a string that is not a real IANA zone', async () => {
    const { db, calls } = sequence([{ maybeSingle: { data: null, error: null } }])

    const result = await resolveOrCreateEventFromGhl({ db, ...CREATE_ARGS, timezone: 'Mars/Olympus_Mons' })

    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ error: expect.stringContaining('event_timezone_invalid') })
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  // "EST" and "America/Chicago" are both accepted by Intl; "Chicago" is not.
  it('rejects a bare city name that is not a zone', async () => {
    const { db } = sequence([{ maybeSingle: { data: null, error: null } }])
    const result = await resolveOrCreateEventFromGhl({ db, ...CREATE_ARGS, timezone: 'Chicago' })
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('event_timezone_invalid') })
  })

  it('creates a DRAFT, non-discoverable event stamped with ghl_event_id', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },          // ghl_event_id lookup
      { maybeSingle: { data: null, error: null } },          // slug uniqueness probe
      { single: { data: { id: EVENT_ID, slug: 'birmingham-ieo' }, error: null } },
    ])

    const result = await resolveOrCreateEventFromGhl({
      db, ...CREATE_ARGS, timezone: 'America/Chicago',
    })

    expect(result).toEqual({ ok: true, eventId: EVENT_ID, slug: 'birmingham-ieo', created: true })

    const inserted = calls[2].insert.mock.calls[0][0]
    expect(inserted).toMatchObject({
      org_id: ORG_ID,
      ghl_event_id: 'ghl-evt-99',
      timezone: 'America/Chicago',
      // Not visible to the public until an organizer reviews it.
      status: 'draft',
      is_discoverable: false,
    })
  })

  it('refuses rather than inventing a title or dates', async () => {
    for (const missing of [{ title: null }, { startAt: null }, { endAt: null }]) {
      const { db } = sequence([{ maybeSingle: { data: null, error: null } }])
      const result = await resolveOrCreateEventFromGhl({
        db, ...CREATE_ARGS, ...missing, timezone: 'America/Chicago',
      })
      expect(result.ok).toBe(false)
    }
  })

  // Two attendees on one brand-new GHL event can arrive together and both miss
  // the read. The unique index is the real guard and the winner's row is the one
  // this call wanted.
  it('resolves a 23505 race to the winning event row', async () => {
    const { db } = sequence([
      { maybeSingle: { data: null, error: null } },
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "events_ghl_event_id_key"' } } },
      { maybeSingle: { data: { id: 'evt-winner', slug: 'winner' }, error: null } },
    ])

    const result = await resolveOrCreateEventFromGhl({ db, ...CREATE_ARGS, timezone: 'America/Chicago' })

    expect(result).toEqual({ ok: true, eventId: 'evt-winner', slug: 'winner', created: false })
  })
})

// ── resolveOrCreateTicketTypeForGhlEvent ──────────────────────────────────────

describe('resolveOrCreateTicketTypeForGhlEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the matching ticket type when the payload names one', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: 'tt-named' }, error: null } },
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'VIP' })

    expect(id).toBe('tt-named')
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  // registrations.ticket_type_id is NOT NULL, and a ticket type is a LABEL on this
  // lane, not a gate. GHL has already been paid; losing the seat over a blank
  // caption is strictly worse than an unlabelled registration.
  it('falls back to the GHL Registration type when the name is missing', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },              // fallback lookup
      { single: { data: { id: 'tt-fallback' }, error: null } },  // fallback create
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: undefined })

    expect(id).toBe('tt-fallback')
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({
      event_id: EVENT_ID,
      name: 'GHL Registration',
    })
  })

  it('falls back on an empty or whitespace name rather than refusing', async () => {
    const { db } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-fallback' }, error: null } },
    ])
    expect(await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: '   ' })).toBe('tt-fallback')
  })

  it('falls back when the named type does not exist on the event', async () => {
    const { db } = sequence([
      { maybeSingle: { data: null, error: null } },              // named lookup misses
      { maybeSingle: { data: { id: 'tt-fallback' }, error: null } }, // fallback exists
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Nonexistent Tier' })

    expect(id).toBe('tt-fallback')
  })

  it('reuses an existing fallback instead of creating a second one', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: 'tt-existing-fallback' }, error: null } },
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: null })

    expect(id).toBe('tt-existing-fallback')
    expect(calls[0].insert).not.toHaveBeenCalled()
  })

  it('resolves a lost create race to the winning fallback row', async () => {
    const { db } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: '23505', message: 'duplicate' } } },
      { maybeSingle: { data: { id: 'tt-winner' }, error: null } },
    ])

    expect(await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID })).toBe('tt-winner')
  })

  // Null here means the DATABASE would not yield a row — not that the name was
  // bad. The caller records it as infrastructure failure, not a rejected attendee.
  it('returns null only when even the fallback cannot be produced', async () => {
    const { db } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: '08006', message: 'connection failure' } } },
      { maybeSingle: { data: null, error: null } },
    ])

    expect(await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID })).toBeNull()
  })
})
