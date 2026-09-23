import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRequireUser = vi.fn().mockResolvedValue({ id: 'user-1', email: 'paul@test.com' })
vi.mock('@/lib/auth/get-user', () => ({ requireUser: mockRequireUser }))

const mockAssertPermission = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/auth/assert-permission', () => ({ assertPermission: mockAssertPermission }))
vi.mock('@/lib/auth/permission-error', () => ({
  catchPermission: (e: unknown) => ({ error: (e as Error).message }),
}))

// ── Admin client: event_templates lookup + organizations timezone lookup ─────
const mockAdminSingle = vi.fn()
const mockAdminMaybeSingle = vi.fn()
function makeAdminChain() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: mockAdminSingle,
    maybeSingle: mockAdminMaybeSingle,
  }
}
let adminFromImpl: (table: string) => any
const mockAdminFrom = vi.fn((t: string) => adminFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockAdminFrom })),
}))

// ── Server client: the events insert ──────────────────────────────────────────
const mockEventInsertSingle = vi.fn()
const mockEventsInsert = vi.fn()
function makeServerChain() {
  return {
    insert: mockEventsInsert.mockReturnValue({ select: vi.fn().mockReturnValue({ single: mockEventInsertSingle }) }),
  }
}
const mockServerFrom = vi.fn(() => makeServerChain())
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve({ from: mockServerFrom })),
}))

beforeEach(() => {
  mockRequireUser.mockReset().mockResolvedValue({ id: 'user-1', email: 'paul@test.com' })
  mockAssertPermission.mockReset().mockResolvedValue(undefined)
  mockAdminSingle.mockReset()
  mockAdminMaybeSingle.mockReset()
  mockAdminFrom.mockClear()
  mockEventsInsert.mockReset()
  mockEventInsertSingle.mockReset()
  mockServerFrom.mockClear().mockImplementation(() => makeServerChain())
})

describe('createEventFromTemplate — timezone derivation', () => {
  it('uses the template row timezone when present — never looks up the org', async () => {
    adminFromImpl = (table) => makeAdminChain()
    mockAdminSingle.mockResolvedValueOnce({
      data: { org_id: 'org-1', template_data: { event: { timezone: 'Pacific/Honolulu' } } },
      error: null,
    })
    mockEventInsertSingle.mockResolvedValueOnce({ data: { id: 'evt-new' }, error: null })

    const { createEventFromTemplate } = await import('./sprint11-actions')
    const result = await createEventFromTemplate(
      'tpl-1', 'org-1', 'New Event', 'new-event',
      '2026-09-01T09:00:00Z', '2026-09-01T17:00:00Z',
    )

    expect(mockEventsInsert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'Pacific/Honolulu' }))
    expect(mockAdminFrom).not.toHaveBeenCalledWith('organizations')
    expect(result).toEqual({ id: 'evt-new', slug: 'new-event' })
  })

  it('derives the org timezone when the template row has none — the New_York literal is gone', async () => {
    adminFromImpl = (table) => makeAdminChain()
    mockAdminSingle.mockResolvedValueOnce({
      data: { org_id: 'org-1', template_data: { event: {} } }, // no timezone on the template
      error: null,
    })
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: { timezone: 'America/Denver' }, error: null })
    mockEventInsertSingle.mockResolvedValueOnce({ data: { id: 'evt-new' }, error: null })

    const { createEventFromTemplate } = await import('./sprint11-actions')
    const result = await createEventFromTemplate(
      'tpl-1', 'org-1', 'New Event', 'new-event',
      '2026-09-01T09:00:00Z', '2026-09-01T17:00:00Z',
    )

    expect(mockAdminFrom).toHaveBeenCalledWith('organizations')
    expect(mockEventsInsert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Denver' }))
    expect(mockEventsInsert).not.toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/New_York' }))
    expect(result).toEqual({ id: 'evt-new', slug: 'new-event' })
  })

  it('errors instead of guessing when neither the template nor the org has a timezone', async () => {
    adminFromImpl = (table) => makeAdminChain()
    mockAdminSingle.mockResolvedValueOnce({
      data: { org_id: 'org-1', template_data: { event: {} } },
      error: null,
    })
    mockAdminMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const { createEventFromTemplate } = await import('./sprint11-actions')
    const result = await createEventFromTemplate(
      'tpl-1', 'org-1', 'New Event', 'new-event',
      '2026-09-01T09:00:00Z', '2026-09-01T17:00:00Z',
    )

    expect(result).toEqual({ error: 'Could not determine a timezone for this event.' })
    expect(mockEventsInsert).not.toHaveBeenCalled()
  })
})

// ── O107: CSV agenda import reads zone-less times in the EVENT's timezone ─────
describe('importAgendaFromCsv — event timezone (O107)', () => {
  const mockSessionsInsert = vi.fn()
  function useEventTimezone(timezone: string | null) {
    mockSessionsInsert.mockReset().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 's-1' }], error: null }),
    })
    mockServerFrom.mockImplementation(((table: string) => {
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { timezone }, error: null }),
        }
      }
      return { insert: mockSessionsInsert }
    }) as any)
  }
  const map = { Title: 'title', Start: 'starts_at', End: 'ends_at' }

  it('converts a naive ISO wall clock in the event zone (15:00 New York → 19:00Z)', async () => {
    useEventTimezone('America/New_York')
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    const res = await importAgendaFromCsv('evt-1', [{ Title: 'Keynote', Start: '2026-09-23T15:00', End: '2026-09-23 17:00' }], map)
    expect(res).toEqual({ imported: 1 })
    const [row] = mockSessionsInsert.mock.calls[0][0]
    expect(row.starts_at).toBe('2026-09-23T19:00:00.000Z')
    expect(row.ends_at).toBe('2026-09-23T21:00:00.000Z')
  })

  it('converts a US-style naive time in the event zone too', async () => {
    useEventTimezone('America/Chicago')
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    await importAgendaFromCsv('evt-1', [{ Title: 'Panel', Start: '9/23/2026 3:00 PM', End: '9/23/2026 4:00 PM' }], map)
    const [row] = mockSessionsInsert.mock.calls[0][0]
    expect(row.starts_at).toBe('2026-09-23T20:00:00.000Z')
    expect(row.ends_at).toBe('2026-09-23T21:00:00.000Z')
  })

  it('keeps a value that already carries Z or an offset as the same instant', async () => {
    useEventTimezone('America/New_York')
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    await importAgendaFromCsv('evt-1', [{ Title: 'Remote', Start: '2026-09-23T15:00:00Z', End: '2026-09-23T15:00:00-07:00' }], map)
    const [row] = mockSessionsInsert.mock.calls[0][0]
    expect(row.starts_at).toBe('2026-09-23T15:00:00.000Z')
    expect(row.ends_at).toBe('2026-09-23T22:00:00.000Z')
  })

  it('keeps a value whose zone is a word the engine honours (EST, GMT-0400)', async () => {
    useEventTimezone('America/Los_Angeles')
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    await importAgendaFromCsv('evt-1', [{ Title: 'East', Start: '9/23/2026 3:00 PM EDT', End: 'Wed Sep 23 2026 16:00:00 GMT-0400 (Eastern Daylight Time)' }], map)
    const [row] = mockSessionsInsert.mock.calls[0][0]
    expect(row.starts_at).toBe('2026-09-23T19:00:00.000Z')
    expect(row.ends_at).toBe('2026-09-23T20:00:00.000Z')
  })

  it('refuses an unreadable time instead of inserting', async () => {
    useEventTimezone('America/New_York')
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    const res = await importAgendaFromCsv('evt-1', [{ Title: 'Bad', Start: '2026-02-30T10:00', End: 'soon' }], map)
    expect(res).toEqual({ imported: 0, error: 'Unrecognised date/time: "2026-02-30T10:00"' })
    expect(mockSessionsInsert).not.toHaveBeenCalled()
  })

  it('fails loud when the event has no timezone', async () => {
    useEventTimezone(null)
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    await expect(importAgendaFromCsv('evt-1', [{ Title: 'X', Start: '2026-09-23T15:00', End: '2026-09-23T16:00' }], map)).rejects.toThrow(RangeError)
    expect(mockSessionsInsert).not.toHaveBeenCalled()
  })
})

// ── Template create reads the typed times in the chosen timezone (D5) ─────────
describe('createEventFromTemplate — times in the chosen timezone', () => {
  function useTemplate(templateTimezone?: string) {
    adminFromImpl = () => makeAdminChain()
    mockAdminSingle.mockResolvedValueOnce({
      data: { org_id: 'org-1', template_data: { event: templateTimezone ? { timezone: templateTimezone } : {} } },
      error: null,
    })
    mockEventInsertSingle.mockResolvedValueOnce({ data: { id: 'evt-new' }, error: null })
  }

  it('the form timezone wins: 15:00 America/New_York → 19:00Z', async () => {
    useTemplate('Pacific/Honolulu')
    const { createEventFromTemplate } = await import('./sprint11-actions')
    await createEventFromTemplate('tpl-1', 'org-1', 'New', 'new', '2026-09-23T15:00', '2026-09-23T17:00', 'America/New_York')
    expect(mockEventsInsert).toHaveBeenCalledWith(expect.objectContaining({
      timezone: 'America/New_York', start_at: '2026-09-23T19:00:00.000Z', end_at: '2026-09-23T21:00:00.000Z',
    }))
  })

  it('15:00 America/Chicago → 20:00Z', async () => {
    useTemplate()
    const { createEventFromTemplate } = await import('./sprint11-actions')
    await createEventFromTemplate('tpl-1', 'org-1', 'New', 'new', '2026-09-23T15:00', '2026-09-23T17:00', 'America/Chicago')
    expect(mockEventsInsert).toHaveBeenCalledWith(expect.objectContaining({ start_at: '2026-09-23T20:00:00.000Z' }))
  })

  it("falls back to the template's timezone when the form sends none", async () => {
    useTemplate('America/Chicago')
    const { createEventFromTemplate } = await import('./sprint11-actions')
    await createEventFromTemplate('tpl-1', 'org-1', 'New', 'new', '2026-09-23T15:00', '2026-09-23T17:00')
    expect(mockEventsInsert).toHaveBeenCalledWith(expect.objectContaining({ timezone: 'America/Chicago', start_at: '2026-09-23T20:00:00.000Z' }))
  })

  it('refuses an end before the start after conversion', async () => {
    useTemplate()
    const { createEventFromTemplate } = await import('./sprint11-actions')
    const res = await createEventFromTemplate('tpl-1', 'org-1', 'New', 'new', '2026-09-23T15:00', '2026-09-23T18:00:00Z', 'America/New_York')
    expect(res).toEqual({ error: 'End time must be after start time' })
    expect(mockEventsInsert).not.toHaveBeenCalled()
  })
})

// ── O113: CSV import checks agenda.manage and only writes allow-listed fields ─
describe('importAgendaFromCsv — permission and field allow-list (O113)', () => {
  const mockSessionsInsert = vi.fn()
  beforeEach(() => {
    mockSessionsInsert.mockReset().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [{ id: 's-1' }], error: null }),
    })
    mockServerFrom.mockImplementation(((table: string) => {
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1', timezone: 'America/New_York' }, error: null }),
        }
      }
      return { insert: mockSessionsInsert }
    }) as any)
  })

  it('refuses a user without agenda.manage, before inserting', async () => {
    mockAssertPermission.mockRejectedValueOnce(new Error("You don't have permission to manage the agenda."))
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    const res = await importAgendaFromCsv('evt-1', [{ Title: 'X' }], { Title: 'title' })
    expect(mockAssertPermission).toHaveBeenCalledWith('org-1', 'user-1', 'agenda.manage')
    expect(res).toEqual({ imported: 0, error: "You don't have permission to manage the agenda." })
    expect(mockSessionsInsert).not.toHaveBeenCalled()
  })

  it('ignores a mapped event_id or is_published; event_id is always the argument', async () => {
    const { importAgendaFromCsv } = await import('./sprint11-actions')
    const res = await importAgendaFromCsv(
      'evt-1',
      [{ Title: 'Keynote', Evt: 'evt-OTHER', Pub: 'true', Desc: 'Hello', Seats: '50', Spk: 'Ada' }],
      { Title: 'title', Evt: 'event_id', Pub: 'is_published', Desc: 'description', Seats: 'capacity', Spk: 'speaker' },
    )
    expect(res).toEqual({ imported: 1 })
    const [row] = mockSessionsInsert.mock.calls[0][0]
    expect(row).toEqual({ title: 'Keynote', description: 'Hello', capacity: 50, session_type: 'talk', event_id: 'evt-1' })
  })
})
