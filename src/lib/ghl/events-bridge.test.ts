// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/embedded/org-helpers', () => ({
  resolveOrgOwnerProfileId: vi.fn(async () => 'profile-owner-1'),
}))

import {
  ghlDollarStringToCents,
  perSeatCents,
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

// ── perSeatCents ──────────────────────────────────────────────────────────────

describe('perSeatCents', () => {
  // The bug this exists to prevent: on the Events WORKFLOW path a 2-seat $398
  // order calls the webhook twice and sends order_total "398" BOTH times, so
  // storing it verbatim books $796 across two seats.
  it('splits an order-scoped total across the seats on the order', () => {
    expect(perSeatCents(39800, 2)).toBe(19900)
  })

  // GHL custom values arrive as strings far more often than as numbers.
  it('accepts the seat count as a numeric string', () => {
    expect(perSeatCents(39800, '2')).toBe(19900)
  })

  it('splits a free order without inventing money', () => {
    expect(perSeatCents(0, 2)).toBe(0)
  })

  // Deliberately lossy: 3 x 333 = 999, one cent short of 1000. The order total
  // stays exact and recoverable by grouping on ghl_order_id, so the rounding is
  // confined to the per-seat view rather than corrupting the order.
  it('rounds to the nearest cent when the split is uneven', () => {
    expect(perSeatCents(1000, 3)).toBe(333)
  })

  it('leaves a single-seat order untouched', () => {
    expect(perSeatCents(19900, 1)).toBe(19900)
  })

  // Every case below returns the total UNCHANGED rather than throwing or zeroing.
  // A seat booked at the full order price is visible and correctable; a refused
  // registration for an order GHL has already been paid for is not. The route
  // warns on this path.
  it('returns the total unchanged when ticket_count is absent', () => {
    expect(perSeatCents(39800, undefined)).toBe(39800)
  })

  it('returns the total unchanged for a zero seat count', () => {
    expect(perSeatCents(39800, '0')).toBe(39800)
  })

  // Guards the divide: a negative count would flip the sign on amount_paid_cents.
  it('returns the total unchanged for a negative seat count', () => {
    expect(perSeatCents(39800, '-1')).toBe(39800)
  })

  it('returns the total unchanged for a non-numeric seat count', () => {
    expect(perSeatCents(39800, 'abc')).toBe(39800)
  })

  // A fractional seat count is nonsense, not a rounding opportunity.
  it('returns the total unchanged for a fractional seat count', () => {
    expect(perSeatCents(39800, 2.5)).toBe(39800)
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

  // O94: GHL sends the tier name and we used to throw it away, so every tier on an
  // R66 auto-created event collapsed into one generic "GHL Registration" row.
  it('creates the type under the name GHL sent when the event has no types yet', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },                // named lookup misses
      { single: { data: { id: 'tt-early-bird' }, error: null } },  // create
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({
      db, eventId: EVENT_ID, name: 'ZZ PREZVA RECON Early Bird',
    })

    expect(id).toBe('tt-early-bird')
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({
      event_id:   EVENT_ID,
      name:       'ZZ PREZVA RECON Early Bird',
      type:       'paid',
      is_visible: false,
      is_active:  true,
    })
  })

  it('trims the name before creating with it', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-vip' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: '  VIP  ' })

    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({ name: 'VIP' })
  })

  // The case-insensitivity lives in the ilike, so what matters here is that the
  // lookup runs against the supplied name and nothing is created behind it.
  it('matches an existing type whose capitalisation differs instead of creating a second', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: 'tt-vip' }, error: null } },
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'vip' })

    expect(id).toBe('tt-vip')
    expect(calls[0].ilike).toHaveBeenCalledWith('name', 'vip')
    expect(calls[0].insert).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
  })

  // THE guard on this fix. GHL's only ticket-name merge field is "Event . Ticket .
  // Names" — plural, comma-joined across the ORDER — so a mixed-tier order would
  // otherwise mint a permanent type literally named after two tiers.
  it('falls back and warns on a comma-joined multi-tier name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },              // named lookup misses
      { maybeSingle: { data: null, error: null } },              // fallback lookup misses
      { single: { data: { id: 'tt-fallback' }, error: null } },  // fallback create
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({
      db, eventId: EVENT_ID, name: 'Early Bird, Standard',
    })

    expect(id).toBe('tt-fallback')
    expect(calls[2].insert.mock.calls[0][0]).toMatchObject({ name: 'GHL Registration' })
    expect(warn).toHaveBeenCalled()
    expect(JSON.stringify(warn.mock.calls[0])).toContain('Early Bird, Standard')
    warn.mockRestore()
  })

  // registrations.ticket_type_id is NOT NULL, and a ticket type is a LABEL on this
  // lane, not a gate. GHL has already been paid; losing the seat over a blank
  // caption is strictly worse than an unlabelled registration.
  it('falls back to the GHL Registration type when the name is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    // A missing name is routine, not a payload worth a line in the logs.
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('falls back on an empty or whitespace name rather than refusing', async () => {
    const { db } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-fallback' }, error: null } },
    ])
    expect(await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: '   ' })).toBe('tt-fallback')
  })

  // A runaway merge field, not a tier.
  it('falls back and warns on a name longer than 100 characters', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-fallback' }, error: null } },
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({
      db, eventId: EVENT_ID, name: 'A'.repeat(101),
    })

    expect(id).toBe('tt-fallback')
    expect(calls[2].insert.mock.calls[0][0]).toMatchObject({ name: 'GHL Registration' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('accepts a name of exactly 100 characters', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-long' }, error: null } },
    ])

    const name = 'A'.repeat(100)
    expect(await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name })).toBe('tt-long')
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({ name })
  })

  // "GHL Registration" arriving as the payload's own ticket name must not mint a
  // second type alongside the fallback — it IS the fallback.
  it('creates a single fallback row when the name already is the fallback, in any case', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },              // named lookup misses
      { maybeSingle: { data: null, error: null } },              // fallback lookup misses
      { single: { data: { id: 'tt-fallback' }, error: null } },
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({
      db, eventId: EVENT_ID, name: 'ghl registration',
    })

    expect(id).toBe('tt-fallback')
    const inserts = calls.filter((c: any) => c.insert.mock.calls.length > 0)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].insert.mock.calls[0][0]).toMatchObject({ name: 'GHL Registration' })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  // UPDATED for O94: a usable name that matches nothing now MINTS that type. It
  // used to return the event's fallback row instead, which is the defect.
  it('creates the named type when it does not yet exist on the event', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },                       // named lookup misses
      { single: { data: { id: 'tt-nonexistent-tier' }, error: null } },   // create
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Nonexistent Tier' })

    expect(id).toBe('tt-nonexistent-tier')
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({ name: 'Nonexistent Tier' })
  })

  // A usable name skips the fallback read entirely. Were it read first, one
  // "GHL Registration" row on the event would capture every later tier forever —
  // the fix would work exactly once and then stop. Two db.from() calls, no more,
  // is what proves the read was skipped.
  it('mints its own type for a usable name even when a fallback row exists on the event', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },              // 'Standard' lookup misses
      { single: { data: { id: 'tt-standard' }, error: null } },  // straight to create
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Standard' })

    expect(id).toBe('tt-standard')
    expect(calls).toHaveLength(2)
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({ name: 'Standard' })
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

  // A concurrent seat of the SAME tier creates that tier's row, not the fallback's,
  // so the recovery read has to use the name we attempted or it finds nothing.
  it('resolves a 23505 on a named create by re-reading the attempted name', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: null, error: { code: '23505', message: 'duplicate' } } },
      { maybeSingle: { data: { id: 'tt-race-winner' }, error: null } },
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Early Bird' })

    expect(id).toBe('tt-race-winner')
    expect(calls[2].ilike).toHaveBeenCalledWith('name', 'Early Bird')
    expect(calls[2].ilike).not.toHaveBeenCalledWith('name', 'GHL Registration')
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

  // UPDATED for O95/D1. This used to pass three empty steps and assert null, which
  // was exactly the regression: a usable name whose create failed had nowhere left
  // to go. Null is now legitimate only when ALL SIX routes yield nothing, so the
  // steps are spelled out in full and the call count is asserted — otherwise the
  // test would keep passing off `sequence`'s empty defaults and prove nothing.
  it('returns null for a named create only when every route, named and fallback, yields nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },                                    // named read
      { single: { data: null, error: { code: '08006', message: 'connection failure' } } }, // named create
      { maybeSingle: { data: null, error: null } },                                    // named re-read
      { maybeSingle: { data: null, error: null } },                                    // fallback read
      { single: { data: null, error: { code: '08006', message: 'connection failure' } } }, // fallback create
      { maybeSingle: { data: null, error: null } },                                    // fallback re-read
    ])

    expect(await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Early Bird' })).toBeNull()
    expect(calls).toHaveLength(6)
    expect(err).toHaveBeenCalled()
    warn.mockRestore()
    err.mockRestore()
  })

  // ── O95/D1: R67 — a ticket name is a LABEL, never a gate ────────────────────

  // THE regression this fix exists for. Before O95 a usable name whose insert failed
  // returned null, the route turned that into ticket_type_unresolvable, and a seat
  // GHL had already been paid for was REFUSED over a caption. The named routes are
  // exhausted first, then the shared fallback row catches the seat.
  it('falls through to an existing fallback row when a usable name cannot be created', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },                                     // 'Early Bird' read misses
      { single: { data: null, error: { code: '23514', message: 'check violation' } } }, // its create fails
      { maybeSingle: { data: null, error: null } },                                     // its re-read misses
      { maybeSingle: { data: { id: 'tt-fallback' }, error: null } },                    // fallback read hits
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Early Bird' })

    expect(id).toBe('tt-fallback')
    expect(calls).toHaveLength(4)
    // The named routes are tried FIRST and in full — the tier is never merged into
    // the generic row while its own row was still obtainable.
    expect(calls[0].ilike).toHaveBeenCalledWith('name', 'Early Bird')
    expect(calls[2].ilike).toHaveBeenCalledWith('name', 'Early Bird')
    expect(calls[3].ilike).toHaveBeenCalledWith('name', 'GHL Registration')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('creates the fallback when a usable name cannot be created and no fallback exists yet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },                                     // 'Early Bird' read misses
      { single: { data: null, error: { code: '23514', message: 'check violation' } } }, // its create fails
      { maybeSingle: { data: null, error: null } },                                     // its re-read misses
      { maybeSingle: { data: null, error: null } },                                     // fallback read misses
      { single: { data: { id: 'tt-fallback-new' }, error: null } },                     // fallback create
    ])

    const id = await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Early Bird' })

    expect(id).toBe('tt-fallback-new')
    expect(calls).toHaveLength(5)
    expect(calls[4].insert.mock.calls[0][0]).toMatchObject({ name: 'GHL Registration' })
    warn.mockRestore()
  })

  // ── O95/D3: ilike wildcards ─────────────────────────────────────────────────

  // `%` and `_` are LIKE wildcards, and supabase-js appends the pattern verbatim,
  // so an unescaped name matches rows it should not: "VIP_Plus" would find
  // "VIP-Plus" and hang the seat off the wrong tier.
  it('escapes % and _ in the named read so the match stays exact', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: 'tt-vip' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'VIP_Plus 50%' })

    expect(calls[0].ilike).toHaveBeenCalledWith('name', 'VIP\\_Plus 50\\%')
  })

  // The backslash goes first or it would re-escape the escapes just added.
  it('escapes a backslash before the wildcards it escapes', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: 'tt-odd' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'A\\_B' })

    expect(calls[0].ilike).toHaveBeenCalledWith('name', 'A\\\\\\_B')
  })

  // The escaping belongs to the QUERY, not to the row. A stored name carrying
  // backslashes would come back wrong on every later read and in the organizer's UI.
  it('stores the raw name even when the read pattern was escaped', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-pct' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: '50% Off' })

    expect(calls[0].ilike).toHaveBeenCalledWith('name', '50\\% Off')
    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({ name: '50% Off' })
  })

  it('escapes the fallback read too', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: { id: 'tt-fallback' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: null })

    // No wildcards in the literal fallback name, so escaping is a no-op on it — what
    // is asserted is that the fallback read goes through the same escaped helper.
    expect(calls[0].ilike).toHaveBeenCalledWith('name', 'GHL Registration')
  })

  // ── O95/D2: ghl_managed ─────────────────────────────────────────────────────

  // 0147's partial unique index on (event_id, lower(name)) is WHERE ghl_managed, so
  // an insert that forgets the flag is a row outside the constraint — the duplicate
  // this whole migration exists to stop. Both inserts the resolver can make are
  // asserted here.
  it('sets ghl_managed on the named insert', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-named' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: 'Early Bird' })

    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({
      event_id:    EVENT_ID,
      name:        'Early Bird',
      ghl_managed: true,
    })
  })

  it('sets ghl_managed on the fallback insert', async () => {
    const { db, calls } = sequence([
      { maybeSingle: { data: null, error: null } },
      { single: { data: { id: 'tt-fallback' }, error: null } },
    ])

    await resolveOrCreateTicketTypeForGhlEvent({ db, eventId: EVENT_ID, name: undefined })

    expect(calls[1].insert.mock.calls[0][0]).toMatchObject({
      event_id:    EVENT_ID,
      name:        'GHL Registration',
      ghl_managed: true,
    })
  })
})
