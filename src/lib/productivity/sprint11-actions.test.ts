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
