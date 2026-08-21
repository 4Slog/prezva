// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/integrations/ghl/client', () => ({
  ghlPut: vi.fn(),
  ghlPost: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { getAccessToken: vi.fn() },
}))
vi.mock('@/lib/integrations/ghl/org-config', () => ({
  getGhlOrgConfig: vi.fn(),
}))

import { postRegistrationWriteback, eventDateInEventTz } from './post-registration-writeback'
import { ghlPut, ghlPost } from '@/lib/integrations/ghl/client'
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

// apptId drives the guard: a stored ghl_appointment_id means an appointment was
// already booked for this sync state.
function makeSupabase(apptId: string | null) {
  const update = vi.fn().mockReturnThis()
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.update = update
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: { ghl_appointment_id: apptId }, error: null })
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
