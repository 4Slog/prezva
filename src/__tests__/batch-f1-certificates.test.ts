// Batch F1 (O101): certificate eligibility, CE wording at 0 credits, and
// issued certificates rendering from their stored row.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

vi.mock('@/lib/trigger', () => ({
  enqueueCertificateEmail: vi.fn().mockResolvedValue(null),
  enqueueGhlStageMove: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/integrations/ghl/location', () => ({ ghlLocationIdForOrg: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/integrations/ghl/adapter', () => ({ ghlAdapter: { getAccessToken: vi.fn() } }))

// Spy on the real eligibility so the download test can prove it is skipped.
vi.mock('@/lib/certificates/eligibility', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/certificates/eligibility')>()
  return { ...actual, checkEligibility: vi.fn(actual.checkEligibility) }
})

let adminClient: any
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminClient) }))
let authUserId: string | null = null
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: authUserId ? { id: authUserId } : null } }) } })),
}))

let pdfProps: any = null
vi.mock('@react-pdf/renderer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@react-pdf/renderer')>()
  return {
    ...actual,
    renderToBuffer: vi.fn(async (el: any) => { pdfProps = el.props; return Buffer.from('%PDF') }),
  }
})

import { checkEligibility } from '@/lib/certificates/eligibility'
import { issueCertificateCore } from '@/lib/certificates/issue-core'
import { templateForCredits } from '@/lib/certificates/ce-wording'
import { renderBody, type CertificateProps } from '@/lib/pdf/Certificate'
import { DEFAULT_CERTIFICATE_TEMPLATE, CERTIFICATE_TEMPLATES } from '@/lib/templates/certificates'

const REG = 'reg-1'
const EVENT = 'ev-1'

function reg(overrides: Record<string, any> = {}) {
  return {
    id: REG, status: 'confirmed', event_id: EVENT, user_id: 'u-1', certificate_token: 'tok',
    attendee_name: 'Ada Lovelace', attendee_email: 'ada@example.com',
    events: {
      id: EVENT, title: 'Summit', start_at: '2026-09-01T14:00:00Z', slug: 'summit', org_id: 'org-1',
      certificate_enabled: true, certificate_min_session_attendance_pct: 60,
      organizations: { id: 'org-1', name: 'Org', logo_url: null },
    },
    ...overrides,
  }
}

function session(id: string, published = true, ce = 1) {
  return { id, event_id: EVENT, is_published: published, ce_credit_hours: ce, starts_at: null, ends_at: null }
}

// Makes every read of `table` fail, to prove errors surface.
function failingReads(client: any, table: string) {
  const inner = client.from
  return {
    ...client,
    from: (t: string) => {
      const b = inner(t)
      if (t !== table) return b
      const err = { data: null, error: { code: 'XX000', message: `${t} unavailable` }, count: null }
      b.then = (ok: any, bad: any) => Promise.resolve(err).then(ok, bad)
      b.maybeSingle = vi.fn(async () => err)
      return b
    },
  }
}

const CE_RE = /continuing education|\bCE\b|credit hour|licensing board|0 sessions/i

describe('F-R1 zero published sessions', () => {
  it('no door check-in → not eligible, and the sweep path does not certify', async () => {
    const db = createFakeDb({ registrations: [reg()], sessions: [], check_ins: [], session_attendance: [], issued_certificates: [] })
    const r = await checkEligibility(REG, db.client)
    expect(r.eligible).toBe(false)
    expect(r.ceCredits).toBe(0)

    const issued = await issueCertificateCore(db.client, REG, 'dashboard')
    expect(issued.skipped).toBe(true)
    expect(db.writesTo('issued_certificates')).toHaveLength(0)
  })

  it('door check-in (session_id null) → eligible with 0 CE credits', async () => {
    const db = createFakeDb({
      registrations: [reg()], sessions: [session('s-draft', false)],
      check_ins: [{ id: 'c1', registration_id: REG, session_id: null }], session_attendance: [],
    })
    const r = await checkEligibility(REG, db.client)
    expect(r).toEqual({ eligible: true, sessionsAttended: 0, sessionsTotal: 0, ceCredits: 0 })
  })

  it('a session check-in alone is not a door check-in', async () => {
    const db = createFakeDb({
      registrations: [reg()], sessions: [session('s-draft', false)],
      check_ins: [{ id: 'c1', registration_id: REG, session_id: 's-draft' }], session_attendance: [],
    })
    expect((await checkEligibility(REG, db.client)).eligible).toBe(false)
  })
})

describe('F-R5 sessions exist', () => {
  it('unchanged: attending enough published sessions is eligible with summed CE', async () => {
    const db = createFakeDb({
      registrations: [reg()], sessions: [session('a', true, 1.5), session('b', true, 2)],
      check_ins: [{ id: 'c1', registration_id: REG, session_id: 'a' }],
      session_attendance: [{ registration_id: REG, session_id: 'b', watch_duration_seconds: null }],
    })
    expect(await checkEligibility(REG, db.client)).toEqual({ eligible: true, sessionsAttended: 2, sessionsTotal: 2, ceCredits: 3.5 })
  })

  it('below the threshold stays ineligible, and a door check-in does not rescue it', async () => {
    const db = createFakeDb({
      registrations: [reg()], sessions: [session('a'), session('b'), session('c')],
      check_ins: [{ id: 'd', registration_id: REG, session_id: null }, { id: 'c1', registration_id: REG, session_id: 'a' }],
      session_attendance: [],
    })
    const r = await checkEligibility(REG, db.client)
    expect(r.eligible).toBe(false)
    expect(r.sessionsAttended).toBe(1)
  })

  it('an attended UNPUBLISHED session does not count', async () => {
    const db = createFakeDb({
      registrations: [reg()], sessions: [session('a'), session('b'), session('hidden', false, 5)],
      check_ins: [{ id: 'c1', registration_id: REG, session_id: 'a' }, { id: 'c2', registration_id: REG, session_id: 'hidden' }],
      session_attendance: [{ registration_id: REG, session_id: 'hidden', watch_duration_seconds: null }],
    })
    const r = await checkEligibility(REG, db.client)
    expect(r).toMatchObject({ eligible: false, sessionsAttended: 1, sessionsTotal: 2, ceCredits: 1 })
  })

  it.each(['registrations', 'sessions', 'check_ins', 'session_attendance'])(
    'a %s read error throws and issuing reports an error (never eligible)',
    async (table) => {
      const db = createFakeDb({ registrations: [reg()], sessions: [], check_ins: [{ id: 'd', registration_id: REG, session_id: null }], session_attendance: [], issued_certificates: [] })
      const broken = failingReads(db.client, table)
      await expect(checkEligibility(REG, broken)).rejects.toThrow(/unavailable/)

      const out = await issueCertificateCore(broken, REG, 'dashboard')
      expect(out.error).toMatch(/eligibility/i)
      expect(out.skipped).toBeUndefined()
      expect(out.data).toBeUndefined()
      expect(db.writesTo('issued_certificates')).toHaveLength(0)
    },
  )
})

describe('F-R2 no CE wording at 0 credits', () => {
  const props = (ceCredits: number, sessionsAttended = 0): CertificateProps => ({
    attendeeName: 'Ada', eventTitle: 'Summit', eventDate: 'Sept 1, 2026', sessionsAttended, ceCredits,
    orgName: 'Org', verificationId: 'v1', issueDate: 'Sept 2, 2026', template: DEFAULT_CERTIFICATE_TEMPLATE.payload,
  })
  const all = [DEFAULT_CERTIFICATE_TEMPLATE.payload, ...CERTIFICATE_TEMPLATES.map((t) => t.payload)]

  it.each(all.map((t) => [t.title, t]))('%s renders with no CE wording at 0 credits', (_title, tpl) => {
    const t = templateForCredits(tpl, 0)
    const p = props(0)
    for (const text of [t.title, t.subtitle ?? '', renderBody(t.body, p), renderBody(t.footer, p), t.licensing_body_note ?? '']) {
      expect(text).not.toMatch(CE_RE)
    }
    expect(t.ce_credits_field).toBe(false)
  })

  it.each([
    'Certificate of Continuing Professional Education',
    'Awarded 3 CPE credits',
    'Earned 2 contact hours',
    'Approved for 1.5 CEUs',
  ])('variant "%s" is treated as CE wording', (text) => {
    const tpl = { ...DEFAULT_CERTIFICATE_TEMPLATE.payload, title: text, body: text }
    const t = templateForCredits(tpl, 0)
    expect(t.title).toBe('Certificate of Attendance')
    expect(t.body).not.toBe(text)
  })

  it('an ordinary lowercase "ce" (French) is not CE wording', () => {
    const body = 'ce certificat atteste que {attendee_name} a participé à {event_title}.'
    expect(templateForCredits({ ...DEFAULT_CERTIFICATE_TEMPLATE.payload, body }, 0).body).toBe(body)
  })

  it('stored "0.00" from numeric columns counts as 0', () => {
    const ce = CERTIFICATE_TEMPLATES.find((t) => t.id === 'cert-ce-credit')!.payload
    expect(templateForCredits(ce, '0.00').title).toBe('Certificate of Attendance')
  })

  it('a certificate WITH credits is unchanged', () => {
    const ce = CERTIFICATE_TEMPLATES.find((t) => t.id === 'cert-ce-credit')!.payload
    expect(templateForCredits(ce, 6)).toBe(ce)
  })
})

describe('F-R3 issued certificates render from the stored row', () => {
  beforeEach(() => { pdfProps = null; vi.mocked(checkEligibility).mockClear() })

  it('downloads unchanged after sessions are added, without re-checking eligibility', async () => {
    const db = createFakeDb({
      // Issued as an attendance certificate on a zero-session event…
      issued_certificates: [{
        id: 'cert-1', registration_id: REG, event_id: EVENT, template_id: 'tpl-1', ce_credit_hours: 0,
        sessions_attended: 0, verification_id: 'VER-1', created_at: '2026-09-02T12:00:00Z', ghl_synced_at: '2026-09-02T12:00:00Z',
      }],
      certificate_templates: [{ id: 'tpl-1', org_id: 'org-1', is_default: true, payload: DEFAULT_CERTIFICATE_TEMPLATE.payload }],
      registrations: [reg()],
      // …then the organizer added sessions the attendee never attended.
      sessions: [session('a', true, 3), session('b', true, 3)],
      check_ins: [{ id: 'd', registration_id: REG, session_id: null }],
      session_attendance: [],
    })
    adminClient = db.client
    authUserId = 'u-1'

    const { GET } = await import('@/app/api/certificates/[regId]/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('https://prezva.app/api/certificates/reg-1'), { params: Promise.resolve({ regId: REG }) })

    expect(res.status).toBe(200)
    expect(checkEligibility).not.toHaveBeenCalled()
    expect(pdfProps).toMatchObject({ ceCredits: 0, sessionsAttended: 0, verificationId: 'VER-1' })
    expect(db.writesTo('issued_certificates')).toHaveLength(0)
  })

  it('an unissued, ineligible registration still gets 412', async () => {
    const db = createFakeDb({ issued_certificates: [], registrations: [reg()], sessions: [], check_ins: [], session_attendance: [] })
    adminClient = db.client
    authUserId = 'u-1'
    const { GET } = await import('@/app/api/certificates/[regId]/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('https://prezva.app/api/certificates/reg-1'), { params: Promise.resolve({ regId: REG }) })
    expect(res.status).toBe(412)
    expect(pdfProps).toBeNull()
  })
})
