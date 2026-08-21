// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// R56: ghlAddContactTags/ghlRemoveContactTags MUST be listed here. The writeback's
// outer catch swallows a TypeError from an undefined import, so a missing export
// would be a green test and a dead tag in production.
vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlPut: vi.fn(),
  ghlPost: vi.fn(),
  ghlAddContactTags: vi.fn(),
  ghlRemoveContactTags: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
}))
// Partial mock: the writeback also imports GHL_LIFECYCLE_TAGS from this module
// (R56). A bare factory would leave it undefined, and `GHL_LIFECYCLE_TAGS.linkReady`
// would throw a TypeError straight into the outer catch — swallowed, tag dead, suite
// green. Keeping the real vocabulary is also what makes the literal 'prezva-link-ready'
// assertion below a genuine check on the derived constant.
vi.mock('@/lib/integrations/ghl/org-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/ghl/org-config')>()
  return { ...actual, getGhlOrgConfig: vi.fn() }
})

import { postRegistrationWriteback, eventDateInEventTz } from './post-registration-writeback'
import { ghlPut, ghlPost, ghlAddContactTags, ghlRemoveContactTags } from '@/lib/integrations/ghl/client'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { getGhlOrgConfig } from '@/lib/integrations/ghl/org-config'

const CONFIG_WITH_CALENDAR = {
  pipelineId: 'pipe-1',
  stageIds: {} as never,
  fieldIds: { prezvaAttendeeLink: 'field-link', prezvaEventDate: 'field-date' } as never,
  stageTags: {},
  stageSupersedesTags: {},
  calendarId: 'cal-123',
}

// apptId drives the appointment guard: a stored ghl_appointment_id means an
// appointment was already booked for this sync state.
//
// claimRows drives the R56 one-shot claim. The claim chain is
// update -> eq -> is -> select('id') with select as the AWAITED terminal, which
// is a different shape from the appointment read (select -> eq -> maybeSingle,
// where maybeSingle is the terminal). Making the chain itself thenable serves
// both: awaiting the chain resolves to { data: claimRows }, while the appointment
// read still awaits the maybeSingle promise and never touches `then`.
// [] models "another transport already claimed it" — the row no longer matches
// `link_tag_fired_at is null`, so the conditional UPDATE returns zero rows.
function makeSupabase(apptId: string | null, claimRows: Array<{ id: string }> = [{ id: 'sync-1' }]) {
  const update = vi.fn().mockReturnThis()
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.is = vi.fn().mockReturnValue(chain)
  chain.update = update
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { ghl_appointment_id: apptId }, error: null })
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: claimRows, error: null })
  const from = vi.fn(() => chain)
  return { supabase: { from } as never, from, chain, update }
}

const BASE_PARAMS = {
  orgId: 'org-1',
  syncStateId: 'sync-1',
  locationId: 'loc-1',
  contactId: 'contact-1',
  entryUrl: 'https://prezva.app/e/test/app-access?t=tok',
  eventTitle: 'Test Conference',
  eventStartAt: '2026-09-01T14:00:00Z',
  eventEndAt: '2026-09-01T22:00:00Z',
  eventTimezone: 'America/New_York',
}

beforeEach(() => {
  vi.mocked(getGhlOrgConfig).mockReset().mockResolvedValue(CONFIG_WITH_CALENDAR as never)
  vi.mocked(ghlAdapter.getAccessToken).mockReset().mockResolvedValue('test-token')
  vi.mocked(ghlPut).mockReset().mockResolvedValue({} as never)
  vi.mocked(ghlPost).mockReset().mockResolvedValue({ id: 'appt-new' } as never)
  vi.mocked(ghlAddContactTags).mockReset().mockResolvedValue([])
  vi.mocked(ghlRemoveContactTags).mockReset().mockResolvedValue([])
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('eventDateInEventTz', () => {
  it('formats an instant that rolls back a day in America/New_York', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', 'America/New_York')).toBe('2026-03-14')
  })

  it('returns null rather than throwing for an invalid timeZone', () => {
    expect(eventDateInEventTz('2026-03-15T00:00:00Z', 'Not/AZone')).toBeNull()
  })
})

describe('postRegistrationWriteback', () => {
  it('writes the attendee link and event date, then books the appointment', async () => {
    const { supabase } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlPut).toHaveBeenCalledWith('test-token', '/contacts/contact-1', {
      customFields: [
        { id: 'field-link', value: BASE_PARAMS.entryUrl },
        { id: 'field-date', value: '2026-09-01' },
      ],
    })
    expect(ghlPost).toHaveBeenCalledWith(
      'test-token',
      '/calendars/events/appointments',
      expect.objectContaining({ calendarId: 'cal-123', contactId: 'contact-1', title: 'Test Conference' }),
    )
  })

  // ── THE GUARD ───────────────────────────────────────────────────────────────
  // Appointment creation is the only step in this chain with no natural dedup.
  // A second POST books a second calendar appointment AND re-fires GHL's booking
  // confirmation and reminder notifications at the attendee — visible, annoying,
  // and irreversible. Retries are routine now (12 GHL retries; two transports
  // during the transition), so this guard is what keeps redelivery silent.
  it('SKIPS the appointment POST when ghl_appointment_id is already set', async () => {
    const { supabase } = makeSupabase('appt-existing')

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlPost).not.toHaveBeenCalled()
    // The contact PUT still runs — it is idempotent and keeps the link fresh.
    expect(ghlPut).toHaveBeenCalled()
  })

  it('stores the appointment id after a successful booking', async () => {
    const { supabase, chain } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(chain.update).toHaveBeenCalledWith({ ghl_appointment_id: 'appt-new' })
  })

  it('does not book when the org has no adopted calendar', async () => {
    vi.mocked(getGhlOrgConfig).mockResolvedValue({ ...CONFIG_WITH_CALENDAR, calendarId: null } as never)
    const { supabase } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlPost).not.toHaveBeenCalled()
    expect(ghlPut).toHaveBeenCalled()
  })

  it('records last_error and skips both calls when no access token is available', async () => {
    vi.mocked(ghlAdapter.getAccessToken).mockResolvedValue(null)
    const { supabase, chain } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlPut).not.toHaveBeenCalled()
    expect(ghlPost).not.toHaveBeenCalled()
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ last_error: 'no_ghl_access_token: org org-1' }),
    )
  })

  it('is non-fatal when the appointment POST throws', async () => {
    vi.mocked(ghlPost).mockRejectedValue(new Error('GHL 400'))
    const { supabase } = makeSupabase(null)

    await expect(postRegistrationWriteback({ supabase, ...BASE_PARAMS })).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith('ghl appointment create failed (non-fatal)', expect.any(Error))
  })

  it('is non-fatal when the contact PUT throws', async () => {
    vi.mocked(ghlPut).mockRejectedValue(new Error('GHL 500'))
    const { supabase } = makeSupabase(null)

    await expect(postRegistrationWriteback({ supabase, ...BASE_PARAMS })).resolves.toBeUndefined()
  })

  it('skips everything when the org is GHL-linked but unprovisioned', async () => {
    vi.mocked(getGhlOrgConfig).mockResolvedValue(null)
    const { supabase } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlPut).not.toHaveBeenCalled()
    expect(ghlPost).not.toHaveBeenCalled()
  })
})

// ── R56: prezva-link-ready as an EVENT ────────────────────────────────────────
// O72 was a state check: the GHL workflow waited on prezva_attendee_link being
// non-empty, and cleared the field first so "non-empty" meant "this run wrote
// it". Once R55 Batch 2 moved the write onto the app transport the clear stopped
// being serialized against it and landed 477ms AFTER the write — dead link.
// A tag-added event cannot happen before the PUT, so it carries the freshness
// guarantee structurally rather than by ordering luck.
//
// Every test here asserts a POSITIVE call with arguments. Asserting only that
// nothing threw is exactly what would have passed against the undefined-import
// trap the mock factory at the top of this file now closes.
describe('postRegistrationWriteback — R56 link-ready tag', () => {
  const LINK_READY_TAG = 'prezva-link-ready'

  it('removes then re-adds the tag, remove before add', async () => {
    const { supabase } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlRemoveContactTags).toHaveBeenCalledWith('test-token', 'contact-1', [LINK_READY_TAG])
    expect(ghlAddContactTags).toHaveBeenCalledWith('test-token', 'contact-1', [LINK_READY_TAG])

    // Ordering proof mirrors src/trigger/jobs/__tests__/ghl-stage-move.test.ts:194-199.
    // Order is the whole point: an add with no preceding remove is a no-op for a
    // returning attendee who already carries the tag, so no event fires and the
    // confirmation email never sends.
    const removeOrder = vi.mocked(ghlRemoveContactTags).mock.invocationCallOrder[0]
    const addOrder = vi.mocked(ghlAddContactTags).mock.invocationCallOrder[0]
    expect(removeOrder).toBeLessThan(addOrder)
  })

  // The literal, not GHL_LIFECYCLE_TAGS.linkReady — this is what the GHL workflow
  // trigger is configured against, so a rename of the derived value must fail here.
  it('fires with the literal tag value prezva-link-ready', async () => {
    const { supabase } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(vi.mocked(ghlRemoveContactTags).mock.calls[0][2]).toEqual(['prezva-link-ready'])
    expect(vi.mocked(ghlAddContactTags).mock.calls[0][2]).toEqual(['prezva-link-ready'])
  })

  // The one-shot. Zero rows back from the conditional UPDATE means another
  // transport already claimed this order, so neither helper may fire — a second
  // fire is a second confirmation email at a paying attendee.
  it('fires NEITHER helper when the claim returns no rows', async () => {
    const { supabase } = makeSupabase(null, [])

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlRemoveContactTags).not.toHaveBeenCalled()
    expect(ghlAddContactTags).not.toHaveBeenCalled()
    // Positive assertion that the skip path was actually taken, not that the
    // whole writeback silently died before reaching it.
    expect(ghlPut).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('link-ready already fired for sync state sync-1'),
    )
  })

  it('still adds when the remove throws, and neither failure propagates', async () => {
    vi.mocked(ghlRemoveContactTags).mockRejectedValueOnce(new Error('GHL boom'))
    vi.mocked(ghlAddContactTags).mockRejectedValueOnce(new Error('GHL boom too'))
    const { supabase } = makeSupabase(null)

    await expect(postRegistrationWriteback({ supabase, ...BASE_PARAMS })).resolves.toBeUndefined()

    expect(ghlAddContactTags).toHaveBeenCalledWith('test-token', 'contact-1', [LINK_READY_TAG])
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('link-ready tag removal failed (non-fatal)'),
      expect.any(Error),
    )
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('link-ready tag apply failed (non-fatal)'),
      expect.any(Error),
    )
  })

  // Placement proof. The tag block sits BEFORE the appointment block precisely
  // because that block early-returns; an org with no adopted calendar (SAUP today)
  // must still get the confirmation email.
  it('fires the tag when the org has no calendar and no appointment is booked', async () => {
    vi.mocked(getGhlOrgConfig).mockResolvedValue({ ...CONFIG_WITH_CALENDAR, calendarId: null } as never)
    const { supabase } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(ghlPost).not.toHaveBeenCalled()
    expect(ghlRemoveContactTags).toHaveBeenCalledWith('test-token', 'contact-1', [LINK_READY_TAG])
    expect(ghlAddContactTags).toHaveBeenCalledWith('test-token', 'contact-1', [LINK_READY_TAG])
  })

  // Dropping `.is('link_tag_fired_at', null)` turns the one-shot into an
  // every-time and silently restores the double-email bug — every other test in
  // this file would still pass, so the predicate is asserted directly.
  it('claims with a conditional UPDATE predicated on link_tag_fired_at is null', async () => {
    const { supabase, chain } = makeSupabase(null)

    await postRegistrationWriteback({ supabase, ...BASE_PARAMS })

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ link_tag_fired_at: expect.any(String) }),
    )
    expect(chain.is).toHaveBeenCalledWith('link_tag_fired_at', null)
    expect(chain.eq).toHaveBeenCalledWith('id', 'sync-1')
    // Claimed BEFORE the fire: if the tag call then fails, no tag exists and the
    // workflow's watchdog branch still catches it.
    const claimOrder = vi.mocked(chain.is as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
    const removeOrder = vi.mocked(ghlRemoveContactTags).mock.invocationCallOrder[0]
    expect(claimOrder).toBeLessThan(removeOrder)
  })
})
