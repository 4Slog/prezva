// Batch E4: queries use real columns (live schema 2026-09-25) and surface their
// errors; ticket transfer works for standalone tickets and is refused for
// GHL-sourced ones (E-R6).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as any, user: { id: 'u1', email: 'ann@x.com' } as any, fetch: [] as any[] }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => h.db.client) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => h.db.client) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => h.user) }))

const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf-8')
const params = <T,>(p: T) => ({ params: Promise.resolve(p) })

beforeEach(() => {
  h.fetch = []
  vi.stubGlobal('fetch', vi.fn(async (...a: unknown[]) => { h.fetch.push(a); return new Response('{}') }))
})

// ── #22 + E-R6: ticket transfer ───────────────────────────────────────────────
describe('transferRegistration (#22, E-R6)', () => {
  function setup(reg: Record<string, unknown>, opts: { linked?: boolean; linkError?: boolean } = {}) {
    h.db = createFakeDb({
      registrations: [{
        id: 'r1', user_id: 'u1', status: 'confirmed', event_id: 'e1', attendee_name: 'Ann', attendee_email: 'ann@x.com',
        ghl_attendee_id: null, ghl_order_id: null, check_ins: [],
        qr_code: 'oldqr', pin: '111111', app_access_token: 'oldapp', certificate_token: 'oldcert',
        events: { title: 'Summit', slug: 'summit', org_id: 'org-1', ghl_event_id: null },
        ...reg,
      }],
      ghl_location_links: opts.linked ? [{ org_id: 'org-1', ghl_location_id: 'loc-1' }] : [],
    })
    if (opts.linkError) {
      const from = h.db.client.from
      h.db.client.from = vi.fn((t: string) => t === 'ghl_location_links'
        ? { select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'down' } }) }) }) }) }
        : from(t))
    }
  }
  const row = () => h.db.tables.registrations[0]
  const GHL = { error: 'Transfers for this event are handled by the organizer.' }

  it('a standalone registration transfers (no longer "Registration not found")', async () => {
    setup({})
    const { transferRegistration } = await import('@/lib/registration/transfer-actions')
    expect(await transferRegistration('r1', 'Bob', 'Ray', 'Bob@Y.com')).not.toHaveProperty('error')
    expect(row()).toMatchObject({ attendee_name: 'Bob Ray', attendee_email: 'bob@y.com', user_id: null })
  })

  it('re-issues every credential the previous holder had, in the DB formats', async () => {
    setup({})
    const { transferRegistration } = await import('@/lib/registration/transfer-actions')
    await transferRegistration('r1', 'Bob', 'Ray', 'bob@y.com')
    expect(row().qr_code).toMatch(/^[0-9a-f]{32}$/)
    expect(row().app_access_token).toMatch(/^[0-9a-f]{32}$/)
    expect(row().certificate_token).toMatch(/^[0-9a-f]{32}$/)
    expect(row().pin).toMatch(/^\d{6}$/)
    expect(row().app_access_token).not.toBe('oldapp')
  })

  it('escapes the new holder’s name in the emails and validates the address', async () => {
    setup({})
    const { transferRegistration } = await import('@/lib/registration/transfer-actions')
    expect(await transferRegistration('r1', 'Bob', 'Ray', 'not-an-email')).toHaveProperty('error')
    expect(h.db.writesTo('registrations')).toEqual([])
    await transferRegistration('r1', '<a href="https://evil">x</a>', 'Ray', 'bob@y.com')
    const bodies = h.fetch.map(a => String((a[1] as RequestInit).body))
    expect(bodies.join('')).not.toContain('<a href=\\"https://evil')
    expect(bodies.join('')).toContain('&lt;a href=')
  })

  it.each([
    ['ghl_attendee_id', { ghl_attendee_id: 'att-1' }, {}],
    ['ghl_order_id', { ghl_order_id: 'ord-1' }, {}],
    ['a GHL event', { events: { title: 'S', slug: 's', org_id: 'org-1', ghl_event_id: 'gev-1' } }, {}],
    ['a GHL-linked org', {}, { linked: true }],
  ])('a registration from %s is refused and untouched', async (_label, reg, opts) => {
    setup(reg, opts)
    const { transferRegistration } = await import('@/lib/registration/transfer-actions')
    expect(await transferRegistration('r1', 'Bob', 'Ray', 'bob@y.com')).toEqual(GHL)
    expect(h.db.writesTo('registrations')).toEqual([])
    expect(h.fetch).toEqual([])
  })

  it('fails closed when the GHL link cannot be read', async () => {
    setup({}, { linkError: true })
    const { transferRegistration } = await import('@/lib/registration/transfer-actions')
    expect(await transferRegistration('r1', 'Bob', 'Ray', 'bob@y.com')).toHaveProperty('error')
    expect(h.db.writesTo('registrations')).toEqual([])
  })

  it('a checked-in registration (door check_ins row) cannot be transferred', async () => {
    setup({ check_ins: [{ id: 'c1', session_id: null }] })
    const { transferRegistration } = await import('@/lib/registration/transfer-actions')
    expect(await transferRegistration('r1', 'Bob', 'Ray', 'bob@y.com')).toEqual({ error: 'Cannot transfer after check-in' })
  })

  it('never selects the non-existent registrations.checked_in_at', () => {
    expect(src('src/lib/registration/transfer-actions.ts')).not.toMatch(/select\([^)]*checked_in_at, event_id/)
  })
})

// ── #15: volunteer door check-in ─────────────────────────────────────────────
describe('volunteer check-in (#15)', () => {
  function setup(regStatus = 'confirmed', checkIns: any[] = []) {
    h.db = createFakeDb(
      {
        registrations: [{ id: 'r1', event_id: 'e1', qr_code: 'qr1', status: regStatus, attendee_name: 'Ann', ticket_types: { name: 'GA' } }],
        check_ins: checkIns,
      },
      { unique: { check_ins: (a, b) => a.registration_id === b.registration_id && a.session_id == null && b.session_id == null } },
    )
    h.db.client.rpc = vi.fn(async () => ({ data: { event_id: 'e1', role: 'check-in' }, error: null }))
  }
  const post = async (qr = 'QR1') => {
    const { POST } = await import('@/app/api/volunteer/[token]/checkin/route')
    const res = await POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ qr_code: qr }) }), params({ token: 't' }))
    return { status: res.status, body: await res.json() }
  }

  it('first scan writes one check_ins row and never touches the registration', async () => {
    setup()
    expect((await post()).body).toMatchObject({ ok: true, already_checked_in: false })
    expect(h.db.tables.check_ins).toHaveLength(1)
    expect(h.db.writesTo('registrations')).toEqual([])
  })

  it('a second scan reports already checked in with the real time', async () => {
    setup('confirmed', [{ id: 'c1', registration_id: 'r1', session_id: null, checked_in_at: '2026-10-01T14:00:00Z' }])
    expect((await post()).body).toMatchObject({ already_checked_in: true, checked_in_at: '2026-10-01T14:00:00Z' })
    expect(h.db.tables.check_ins).toHaveLength(1)
  })

  it('a 23505 on check_ins_door_once is "already checked in", not a fresh check-in', async () => {
    setup()
    // Another device wins between the read and the insert.
    const from = h.db.client.from
    let reads = 0
    h.db.client.from = vi.fn((t: string) => {
      const b = from(t)
      if (t === 'check_ins' && reads++ === 0) {
        h.db.tables.check_ins.push({ id: 'c-other', registration_id: 'r1', session_id: null, checked_in_at: '2026-10-01T15:00:00Z' })
        return { ...b, select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }
      }
      return b
    })
    expect((await post()).body).toMatchObject({ already_checked_in: true, checked_in_at: '2026-10-01T15:00:00Z' })
  })

  it('a pending registration is refused', async () => {
    setup('pending')
    expect((await post()).status).toBe(400)
    expect(h.db.writes).toEqual([])
  })
})

// ── #16: volunteer lookup ────────────────────────────────────────────────────
describe('volunteer lookup (#16)', () => {
  it('refuses a volunteer role without attendee search', async () => {
    h.db = createFakeDb({ volunteers: [{ id: 'v1', role: 'usher', event_id: 'e1', portal_access_token: 't' }], registrations: [] })
    const { GET } = await import('@/app/api/volunteer/[token]/lookup/route')
    const { NextRequest } = await import('next/server')
    expect((await GET(new NextRequest('http://x/lookup?q=an'), params({ token: 't' }))).status).toBe(403)
  })

  it('reads check-in state from check_ins and never filters on a non-existent status', async () => {
    h.db = createFakeDb({
      volunteers: [{ id: 'v1', role: 'check-in', event_id: 'e1', portal_access_token: 't' }],
      registrations: [
        { id: 'r1', event_id: 'e1', attendee_name: 'Ann', attendee_email: 'ann@x.com', status: 'confirmed', check_ins: [{ checked_in_at: 'x', session_id: null }] },
        { id: 'r2', event_id: 'e1', attendee_name: 'Andy', attendee_email: 'andy@x.com', status: 'confirmed', check_ins: [{ checked_in_at: 'x', session_id: 's1' }] },
      ],
    })
    const { GET } = await import('@/app/api/volunteer/[token]/lookup/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://x/lookup?q=an'), params({ token: 't' }))
    const { results } = await res.json()
    expect(results.map((r: any) => [r.id, r.checked_in])).toEqual([['r1', true], ['r2', false]])
    const regChain = h.db.client.from.mock.results.find((_r: any, i: number) => h.db.client.from.mock.calls[i][0] === 'registrations')!.value
    expect(regChain.select.mock.calls[0][0]).not.toMatch(/(^|, )checked_in_at/)
    expect(regChain.in).toHaveBeenCalledWith('status', ['confirmed', 'pending'])
  })
})

// ── #7: survey CSV ───────────────────────────────────────────────────────────
describe('survey export (#7)', () => {
  it('orders and prints by submitted_at', async () => {
    h.db = createFakeDb({
      events: [{ id: 'e1', org_id: 'org-1' }],
      org_members: [{ org_id: 'org-1', user_id: 'u1', role: 'admin' }],
      survey_questions: [
        { id: 'q1', survey_id: 'sv1', question_text: 'Q?', sort_order: 0 },
        { id: 'q2', survey_id: 'sv1', question_text: 'Formula', sort_order: 1 },
        { id: 'q3', survey_id: 'sv1', question_text: 'Pick', sort_order: 2 },
      ],
      survey_responses: [{ id: 'resp1', survey_id: 'sv1', submitted_at: '2026-10-01T14:00:00Z', survey_answers: [
        { question_id: 'q1', answer_text: 'yes' },
        { question_id: 'q2', answer_text: '=HYPERLINK(1)' },
        { question_id: 'q3', answer_text: null, answer_choice: ['a', 'b'] },
      ] }],
    })
    const { GET } = await import('@/app/api/events/[id]/surveys/[surveyId]/export/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://x'), params({ id: 'e1', surveyId: 'sv1' }))
    const csv = await res.text()
    expect(csv.split('\n')).toHaveLength(2)
    expect(csv).toContain('"resp1"')
    expect(csv).toContain('"yes"')
    expect(csv).toContain('"\'=HYPERLINK(1)"')
    expect(csv).toContain('"a; b"')
    const chain = h.db.client.from.mock.results.find((_r: any, i: number) => h.db.client.from.mock.calls[i][0] === 'survey_responses')!.value
    expect(chain.order).toHaveBeenCalledWith('submitted_at', { ascending: true })
  })
})

// ── #10: org members ─────────────────────────────────────────────────────────
describe('org members API (#10)', () => {
  it('names the user_id FK for the profiles embed and orders by joined_at', async () => {
    h.db = createFakeDb({ org_members: [{ id: 'm1', org_id: 'org-1', user_id: 'u1', role: 'admin', joined_at: '2026-01-01' }] })
    const { GET } = await import('@/app/api/orgs/[id]/members/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://x'), params({ id: 'org-1' }))
    expect(res.status).toBe(200)
    const chains = h.db.client.from.mock.results.map((r: any) => r.value)
    const list = chains.find((c: any) => c.order.mock.calls.length > 0)
    expect(list.select.mock.calls[0][0]).toContain('profiles!org_members_user_id_fkey(')
    expect(list.select.mock.calls[0][0]).not.toContain('created_at')
    expect(list.order).toHaveBeenCalledWith('joined_at', { ascending: true })
  })
})

// ── Static: columns that exist (#5, #6, #17-20, undo, cancellation) ─────────
describe('real columns', () => {
  it.each([
    ['src/app/(dashboard)/dashboard/page.tsx', /select\('charges_enabled'\)/, /stripe_charges_enabled/],
    ['src/app/(dashboard)/orgs/[slug]/speakers/page.tsx', /select\('id, title, slug, start_at'\)/, /start_date/],
    ['src/app/volunteer/[token]/page.tsx', /type:session_type/, /starts_at, ends_at, type, rooms/],
    ['src/lib/analytics/actions.ts', /gte\('checked_in_at', last30m\)/, /gte\('created_at', last(30|60)m\)/],
    ['src/lib/analytics/engagement-actions.ts', /trivia_questions!inner\(event_id\)/, /from\('community_posts'\)\s*\n\s*\.select\('user_id/],
    ['src/lib/registrations/actions.ts', /profiles!org_members_user_id_fkey\(email\)/, /users\(email\)|update\(\{ status: 'confirmed', checked_in_at: null \}\)|\? 'cancellation_requested'/],
  ])('%s', (file, good, bad) => {
    const s = src(file)
    expect(s).toMatch(good)
    expect(s).not.toMatch(bad)
  })
})
