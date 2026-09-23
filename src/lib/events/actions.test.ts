// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/volunteers/actions', () => ({ sendVolunteerThankYouEmails: vi.fn() }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1' })) }))

const mockApplyStarterTemplate = vi.fn()
vi.mock('@/lib/templates/apply-starter', () => ({ applyStarterTemplate: mockApplyStarterTemplate }))

// ── Table-scripted Supabase fake ─────────────────────────────────────────────
type Resp = { data: unknown; error: unknown }
type TableScript = { maybeSingle?: () => Resp; single?: () => Resp; awaited?: Resp }
let script: Record<string, TableScript> = {}
const inserts: Record<string, unknown[]> = {}
const updates: Record<string, unknown[]> = {}
const eqCalls: Record<string, [string, unknown][]> = {}

function chainFor(table: string) {
  const t = script[table] ?? {}
  const chain: Record<string, unknown> = {}
  for (const k of ['select', 'in', 'order']) chain[k] = vi.fn(() => chain)
  chain.eq = vi.fn((col: string, val: unknown) => { (eqCalls[table] ??= []).push([col, val]); return chain })
  chain.insert = vi.fn((v: unknown) => { (inserts[table] ??= []).push(v); return chain })
  chain.update = vi.fn((v: unknown) => { (updates[table] ??= []).push(v); return chain })
  chain.maybeSingle = vi.fn(async () => t.maybeSingle?.() ?? { data: null, error: null })
  chain.single = vi.fn(async () => t.single?.() ?? { data: null, error: null })
  chain.then = (res: (v: Resp) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(t.awaited ?? { data: null, error: null }).then(res, rej)
  return chain
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: (t: string) => chainFor(t) })),
}))
let adminScript: Record<string, TableScript> = {}
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (t: string) => {
      const saved = script
      script = adminScript
      try { return chainFor(`admin:${t}`) } finally { script = saved }
    },
  })),
}))

import { createEvent, updateEvent, applyStarterAction } from './actions'

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER_ORG_TEMPLATE = '22222222-2222-4222-8222-222222222222'
const OWN_TEMPLATE = '33333333-3333-4333-8333-333333333333'
const NY = 'America/New_York'
const LA = 'America/Los_Angeles'
const STORED = { org_id: ORG, start_at: '2026-09-23T19:00:00+00:00', end_at: '2026-09-23T21:00:00+00:00', timezone: NY }

function fd(entries: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}
const lastUpdate = () => (updates.events ?? []).at(-1) as Record<string, unknown> | undefined

beforeEach(() => {
  for (const o of [inserts, updates, eqCalls]) for (const k of Object.keys(o)) delete o[k]
  mockApplyStarterTemplate.mockReset()
  adminScript = {}
  script = {
    org_members: { maybeSingle: () => ({ data: { role: 'owner' }, error: null }) },
    events: { maybeSingle: () => ({ data: STORED, error: null }), awaited: { data: [{ id: 'evt-1' }], error: null } },
  }
})

// ── createEvent ──────────────────────────────────────────────────────────────

describe('createEvent — times read in the chosen timezone', () => {
  function scriptCreate() {
    script.events = {
      maybeSingle: () => ({ data: null, error: null }), // slug is free
      single: () => ({ data: { id: 'evt-new', slug: 'new-event' }, error: null }),
    }
  }
  const base = { org_id: ORG, title: 'New Event', slug: 'new-event' }

  it('stores 15:00 America/New_York as 19:00Z', async () => {
    scriptCreate()
    const res = await createEvent(fd({ ...base, timezone: NY, start_at: '2026-09-23T15:00', end_at: '2026-09-23T17:00' }))
    expect(res).toEqual({ id: 'evt-new', slug: 'new-event' })
    expect(inserts.events[0]).toMatchObject({ timezone: NY, start_at: '2026-09-23T19:00:00.000Z', end_at: '2026-09-23T21:00:00.000Z' })
  })

  it('stores 15:00 America/Chicago as 20:00Z', async () => {
    scriptCreate()
    await createEvent(fd({ ...base, timezone: 'America/Chicago', start_at: '2026-09-23T15:00', end_at: '2026-09-23T17:00' }))
    expect(inserts.events[0]).toMatchObject({ start_at: '2026-09-23T20:00:00.000Z', end_at: '2026-09-23T22:00:00.000Z' })
  })

  it('converts in the org timezone when the form sends none', async () => {
    scriptCreate()
    script.organizations = { maybeSingle: () => ({ data: { timezone: 'America/Chicago' }, error: null }) }
    await createEvent(fd({ ...base, start_at: '2026-09-23T15:00', end_at: '2026-09-23T17:00' }))
    expect(inserts.events[0]).toMatchObject({ timezone: 'America/Chicago', start_at: '2026-09-23T20:00:00.000Z' })
  })

  it('passes a Z value through unchanged', async () => {
    scriptCreate()
    await createEvent(fd({ ...base, timezone: NY, start_at: '2026-10-15T13:00:00Z', end_at: '2026-10-16T21:00:00Z' }))
    expect(inserts.events[0]).toMatchObject({ start_at: '2026-10-15T13:00:00Z', end_at: '2026-10-16T21:00:00Z' })
  })

  it('refuses an end before the start after conversion', async () => {
    scriptCreate()
    const res = await createEvent(fd({ ...base, timezone: NY, start_at: '2026-09-23T15:00', end_at: '2026-09-23T18:00:00Z' }))
    expect(res).toEqual({ error: 'End time must be after start time' })
    expect(inserts.events).toBeUndefined()
  })
})

// ── updateEvent: general ─────────────────────────────────────────────────────

describe('updateEvent general — Paul: a timezone change never moves the event', () => {
  const general = { title: 'Renamed', description: '', timezone: NY, start_at: '2026-09-23T15:00', end_at: '2026-09-23T17:00' }

  it('saves (the O108 failure is gone)', async () => {
    const res = await updateEvent('evt-1', 'general', fd(general))
    expect(res).toEqual({ success: true })
    expect(lastUpdate()).toMatchObject({ title: 'Renamed', description: null, timezone: NY, start_at: STORED.start_at })
  })

  it('timezone only (times untouched): 19:00Z stays 19:00Z when New York → Los Angeles', async () => {
    await updateEvent('evt-1', 'general', fd({ ...general, timezone: LA }))
    expect(lastUpdate()).toMatchObject({ timezone: LA, start_at: STORED.start_at, end_at: STORED.end_at })
  })

  it('edits the time AND changes the zone: the typed time is read in the new zone', async () => {
    await updateEvent('evt-1', 'general', fd({ ...general, timezone: LA, start_at: '2026-09-23T13:00', end_at: '2026-09-23T15:00' }))
    expect(lastUpdate()).toMatchObject({ timezone: LA, start_at: '2026-09-23T20:00:00.000Z', end_at: '2026-09-23T22:00:00.000Z' })
  })

  it('surfaces errors instead of saving', async () => {
    expect(await updateEvent('evt-1', 'general', fd({ ...general, end_at: '2026-09-23T14:00' })))
      .toEqual({ error: 'End time must be after start time' })
    expect(await updateEvent('evt-1', 'general', fd({ ...general, title: 'X' })))
      .toEqual({ error: 'Event name must be at least 2 characters' })
    expect(await updateEvent('evt-1', 'general', fd({ ...general, timezone: 'Not/AZone' })))
      .toEqual({ error: 'Unknown timezone: Not/AZone' })
    expect(lastUpdate()).toBeUndefined()
  })

  it('never touches registration toggles', async () => {
    await updateEvent('evt-1', 'general', fd(general))
    for (const k of ['waitlist_enabled', 'require_approval', 'allow_public_attendee_list', 'certificate_enabled']) {
      expect(lastUpdate()).not.toHaveProperty(k)
    }
  })

  it('refuses a non-admin', async () => {
    script.org_members = { maybeSingle: () => ({ data: { role: 'staff' }, error: null }) }
    expect(await updateEvent('evt-1', 'general', fd(general))).toEqual({ error: 'Insufficient permissions' })
  })

  it('refuses an unknown section', async () => {
    expect(await updateEvent('evt-1', 'bogus' as never, fd(general))).toEqual({ error: 'Unknown settings section' })
  })
})

// ── updateEvent: venue ───────────────────────────────────────────────────────

describe('updateEvent venue', () => {
  it('saves only venue columns and never switches a toggle off', async () => {
    const res = await updateEvent('evt-1', 'venue', fd({ venue_name: 'Hall A', venue_address: '', venue_city: 'Atlanta', venue_state: 'GA' }))
    expect(res).toEqual({ success: true })
    expect(lastUpdate()).toEqual({ venue_name: 'Hall A', venue_address: null, venue_city: 'Atlanta', venue_state: 'GA' })
  })

  it('surfaces an error', async () => {
    expect(await updateEvent('evt-1', 'venue', fd({ venue_name: 'x'.repeat(121) }))).toHaveProperty('error')
  })
})

// ── updateEvent: registration ────────────────────────────────────────────────

describe('updateEvent registration', () => {
  const allOn = {
    capacity: '100', waitlist_enabled: 'true', require_approval: 'true', allow_public_attendee_list: 'true',
    registration_invite_code: ' CIVITAS2026 ', registration_domain_restrict: '@Acme.com',
  }

  it('saves the toggles, the invite code and the domain restriction', async () => {
    expect(await updateEvent('evt-1', 'registration', fd(allOn))).toEqual({ success: true })
    expect(lastUpdate()).toEqual({
      capacity: 100, waitlist_enabled: true, require_approval: true, allow_public_attendee_list: true,
      registration_invite_code: 'CIVITAS2026', registration_domain_restrict: 'acme.com',
    })
  })

  for (const box of ['waitlist_enabled', 'require_approval', 'allow_public_attendee_list'] as const) {
    it(`unchecking ${box} turns it off`, async () => {
      const { [box]: _dropped, ...rest } = allOn
      await updateEvent('evt-1', 'registration', fd(rest))
      expect(lastUpdate()).toMatchObject({ [box]: false })
    })
  }

  it('a literal "false" is off, not coerced to true', async () => {
    await updateEvent('evt-1', 'registration', fd({ ...allOn, waitlist_enabled: 'false' }))
    expect(lastUpdate()).toMatchObject({ waitlist_enabled: false })
  })

  it('blank capacity, invite code and domain clear them', async () => {
    await updateEvent('evt-1', 'registration', fd({ capacity: '', registration_invite_code: '', registration_domain_restrict: '' }))
    expect(lastUpdate()).toMatchObject({ capacity: null, registration_invite_code: null, registration_domain_restrict: null })
  })

  it('surfaces validation errors', async () => {
    expect(await updateEvent('evt-1', 'registration', fd({ ...allOn, registration_domain_restrict: 'not a domain' })))
      .toEqual({ error: 'Enter a domain like acme.com' })
    expect(await updateEvent('evt-1', 'registration', fd({ ...allOn, registration_invite_code: 'two words' })))
      .toEqual({ error: 'Invite code cannot contain spaces' })
    expect(await updateEvent('evt-1', 'registration', fd({ ...allOn, capacity: '0' })))
      .toEqual({ error: 'Capacity must be at least 1' })
  })
})

// ── updateEvent: certificates ────────────────────────────────────────────────

describe('updateEvent certificates', () => {
  it('saves enabled, minimum % and an own-org template', async () => {
    adminScript['admin:certificate_templates'] = { maybeSingle: () => ({ data: { id: OWN_TEMPLATE }, error: null }) }
    const res = await updateEvent('evt-1', 'certificates', fd({
      certificate_enabled: 'true', certificate_min_session_attendance_pct: '75', certificate_template_id: OWN_TEMPLATE,
    }))
    expect(res).toEqual({ success: true })
    expect(lastUpdate()).toEqual({ certificate_enabled: true, certificate_min_session_attendance_pct: 75, certificate_template_id: OWN_TEMPLATE })
    expect(eqCalls['admin:certificate_templates']).toEqual([['id', OWN_TEMPLATE], ['org_id', ORG]])
  })

  it('unchecking certificate_enabled turns it off; an absent picker leaves the template untouched', async () => {
    await updateEvent('evt-1', 'certificates', fd({ certificate_min_session_attendance_pct: '60' }))
    expect(lastUpdate()).toEqual({ certificate_enabled: false, certificate_min_session_attendance_pct: 60 })
  })

  it('"Use org default" clears the template', async () => {
    await updateEvent('evt-1', 'certificates', fd({ certificate_min_session_attendance_pct: '60', certificate_template_id: '' }))
    expect(lastUpdate()).toMatchObject({ certificate_template_id: null })
  })

  it('refuses a template from another org', async () => {
    adminScript['admin:certificate_templates'] = { maybeSingle: () => ({ data: null, error: null }) }
    const res = await updateEvent('evt-1', 'certificates', fd({
      certificate_enabled: 'true', certificate_min_session_attendance_pct: '60', certificate_template_id: OTHER_ORG_TEMPLATE,
    }))
    expect(res).toEqual({ error: 'That certificate template does not belong to this organization.' })
    expect(lastUpdate()).toBeUndefined()
  })

  it('refuses a minimum outside 0-100', async () => {
    expect(await updateEvent('evt-1', 'certificates', fd({ certificate_min_session_attendance_pct: '101' })))
      .toEqual({ error: 'Minimum attendance must be between 0 and 100' })
    expect(await updateEvent('evt-1', 'certificates', fd({ certificate_min_session_attendance_pct: '-1' })))
      .toEqual({ error: 'Minimum attendance must be between 0 and 100' })
  })

  it('refuses a blank minimum instead of saving 0', async () => {
    expect(await updateEvent('evt-1', 'certificates', fd({ certificate_min_session_attendance_pct: '' })))
      .toEqual({ error: 'Minimum attendance must be a number' })
    expect(lastUpdate()).toBeUndefined()
  })
})

describe('updateEvent — an update that reaches no row is not reported as saved', () => {
  it('surfaces a policy-filtered (0-row) update', async () => {
    script.events = { maybeSingle: () => ({ data: STORED, error: null }), awaited: { data: [], error: null } }
    expect(await updateEvent('evt-1', 'venue', fd({ venue_name: 'Hall A' })))
      .toEqual({ error: 'Settings were not saved. You may not have permission to edit this event.' })
  })
})

// ── applyStarterAction ───────────────────────────────────────────────────────

describe('applyStarterAction', () => {
  const template = { sessions: [] } as never

  it('refuses a user who is not an org owner or admin', async () => {
    script.events = { maybeSingle: () => ({ data: { org_id: ORG, timezone: NY }, error: null }) }
    script.org_members = { maybeSingle: () => ({ data: null, error: null }) }
    const res = await applyStarterAction('evt-1', template, '2026-09-23T09:00')
    expect(res).toEqual({ error: 'You must be an org owner or admin to apply a template' })
    expect(mockApplyStarterTemplate).not.toHaveBeenCalled()
  })

  it('reads the start in the event timezone', async () => {
    script.events = { maybeSingle: () => ({ data: { org_id: ORG, timezone: NY }, error: null }) }
    expect(await applyStarterAction('evt-1', template, '2026-09-23T09:00')).toEqual({ ok: true })
    expect(mockApplyStarterTemplate).toHaveBeenCalledWith('evt-1', template, new Date('2026-09-23T13:00:00.000Z'))
  })
})
