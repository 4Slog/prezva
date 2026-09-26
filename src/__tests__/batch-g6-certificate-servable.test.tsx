// Batch G6 (O157, G-R6): a certificate stops being served when its
// registration is cancelled or refunded; the stored row is kept, and a
// registration restored to confirmed serves the same stored certificate. The
// organizer pages show the void count; the certificate email links work
// signed out and point at /verify/{verification_id}.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextRequest } from 'next/server'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
  userId: null as string | null,
  issueOrGet: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`) }), notFound: vi.fn(() => { throw new Error('notFound') }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ ...h.db.client, from: h.db.client.from, auth: { getUser: async () => ({ data: { user: h.userId ? { id: h.userId } : null } }) } }),
}))
vi.mock('@/lib/certificates/certificate-data', () => ({ issueOrGetCertificate: h.issueOrGet }))
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn(async () => Buffer.from('%PDF')) }))
vi.mock('@/lib/pdf/Certificate', () => ({ Certificate: () => null }))
vi.mock('@/lib/trigger', () => ({ enqueueCertificateEmail: vi.fn(async () => null), enqueueGhlStageMove: vi.fn(async () => null) }))
vi.mock('@/lib/audit/log', () => ({ logAudit: vi.fn(async () => undefined) }))
vi.mock('@/lib/integrations/ghl/location', () => ({ ghlLocationIdForOrg: vi.fn(async () => null) }))
vi.mock('@/lib/integrations/ghl/adapter', () => ({ ghlAdapter: { getAccessToken: vi.fn() } }))
vi.mock('@/lib/notifications/create-notification', async () => (await import('./helpers/auto-mock')).autoMockModule())

import { GET as download } from '@/app/api/certificates/[regId]/route'
import VerifyCertificatePage from '@/app/verify/[verificationId]/page'
import { getMyIssuedCertificates } from '@/lib/certificates/actions'
import { countIssuedCertificates, issuedCountLabel } from '@/lib/certificates/issued-counts'
import { certificateDownloadUrl, isCertificateServable } from '@/lib/certificates/servable'
import { issueCertificateCore } from '@/lib/certificates/issue-core'
import { enqueueCertificateEmail } from '@/lib/trigger'

const STORED = { id: 'c1', registration_id: 'r1', event_id: 'e1', verification_id: 'v123', created_at: '2026-09-01T00:00:00Z', template_id: null, ce_credit_hours: 2, sessions_attended: 3 }

function seed(status: string) {
  h.db = createFakeDb({
    registrations: [{ id: 'r1', user_id: 'u1', status, certificate_token: 'tok-1', attendee_name: 'Ann', attendee_email: 'ann@x.com', event_id: 'e1', events: { id: 'e1', title: 'Conf', start_at: '2026-09-01T00:00:00Z', organizations: { id: 'o1', name: 'Org', logo_url: null } } }],
    issued_certificates: [{ ...STORED, events: { title: 'Conf', start_at: '2026-09-01T00:00:00Z', slug: 'conf' }, registrations: { attendee_name: 'Ann', status } }],
    certificate_templates: [],
  })
}
const get = (qs = '') => download(new NextRequest(`https://prezva.app/api/certificates/r1${qs}`), { params: Promise.resolve({ regId: 'r1' }) })

beforeEach(() => {
  h.userId = null
  h.issueOrGet.mockReset().mockResolvedValue({ data: STORED })
})

describe('download route', () => {
  it.each(['refunded', 'cancelled'])('%s → 410, nothing issued or re-served, the stored row kept', async (status) => {
    seed(status)
    const res = await get('?token=tok-1')
    expect(res.status).toBe(410)
    expect(await res.json()).toEqual({ error: 'This certificate is no longer available.' })
    expect(h.issueOrGet).not.toHaveBeenCalled()
    expect(h.db.tables.issued_certificates).toHaveLength(1)
  })

  it('restored to confirmed → downloads the same stored certificate (owner or token)', async () => {
    seed('confirmed')
    const res = await get('?token=tok-1')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(h.issueOrGet).toHaveBeenCalledWith('r1')
    h.userId = 'u1'
    expect((await get()).status).toBe(200)
  })

  it('authorization is still checked first', async () => {
    seed('refunded')
    expect((await get('?token=wrong')).status).toBe(403)
  })
})

describe('verify page', () => {
  const page = async () => render(await VerifyCertificatePage({ params: Promise.resolve({ verificationId: 'v123' }) }))

  it.each(['refunded', 'cancelled'])('%s → "no longer valid", no details, no reason', async (status) => {
    seed(status)
    await page()
    expect(screen.getByText('This certificate is no longer valid.')).toBeInTheDocument()
    expect(screen.queryByText('Valid Certificate')).not.toBeInTheDocument()
    expect(screen.queryByText('Ann')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/refund|cancel/i)
  })

  it('confirmed → valid', async () => {
    seed('confirmed')
    await page()
    expect(screen.getByText('Valid Certificate')).toBeInTheDocument()
    expect(screen.getByText('Ann')).toBeInTheDocument()
  })
})

describe('wallet', () => {
  it('marks a certificate whose registration is not confirmed', async () => {
    seed('refunded')
    h.userId = 'u1'
    expect((await getMyIssuedCertificates())[0]).toMatchObject({ id: 'c1', servable: false })
    seed('confirmed')
    expect((await getMyIssuedCertificates())[0]).toMatchObject({ id: 'c1', servable: true })
  })

  it('renders "No longer valid" with no download or verify link', async () => {
    seed('refunded')
    h.userId = 'u1'
    const { default: MyWalletPage } = await import('@/app/me/wallet/page')
    render(await MyWalletPage())
    expect(screen.getByText('No longer valid')).toBeInTheDocument()
    expect(screen.queryByText('Download PDF')).not.toBeInTheDocument()
    expect(screen.queryByText('Verify')).not.toBeInTheDocument()
  })
})

describe('organizer void count', () => {
  it('counts void certificates from the registration status', async () => {
    h.db = createFakeDb({
      issued_certificates: [
        { id: 'a', event_id: 'e1', registrations: { status: 'confirmed' } },
        { id: 'b', event_id: 'e1', registrations: { status: 'refunded' } },
        { id: 'c', event_id: 'e1', registrations: { status: 'cancelled' } },
        { id: 'd', event_id: 'e2', registrations: { status: 'refunded' } },
      ],
    })
    const counts = await countIssuedCertificates(h.db.client as never, 'e1')
    expect(counts).toEqual({ issued: 3, void: 2 })
    expect(issuedCountLabel(counts!)).toBe('3 issued (2 void — registration cancelled or refunded)')
    expect(issuedCountLabel({ issued: 3, void: 0 })).toBe('3 issued')
  })
})

describe('certificate email links', () => {
  it('download link carries the certificate token; verify link is /verify/{verification_id}', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://prezva.app'
    // Door check-in on an event with no sessions: an attendance certificate (F-R1).
    const db = createFakeDb({
      registrations: [{
        id: 'r9', status: 'confirmed', event_id: 'e9', user_id: null, certificate_token: 'tok-9',
        attendee_name: 'Ada', attendee_email: 'ada@x.com',
        events: { id: 'e9', org_id: 'o9', title: 'Summit', slug: 'summit', end_at: null, timezone: 'UTC',
          certificate_enabled: true, certificate_min_session_attendance_pct: 60, organizations: { id: 'o9', name: 'Org', logo_url: null } },
      }],
      sessions: [], session_attendance: [], issued_certificates: [], certificate_templates: [],
      check_ins: [{ id: 'k', registration_id: 'r9', session_id: null }],
    })
    const out = await issueCertificateCore(db.client, 'r9', 'dashboard')
    expect(out.error).toBeUndefined()
    const cert = db.tables.issued_certificates[0]
    expect(vi.mocked(enqueueCertificateEmail)).toHaveBeenCalledWith(expect.objectContaining({
      certDownloadUrl: 'https://prezva.app/api/certificates/r9?token=tok-9',
      verifyUrl: `https://prezva.app/verify/${cert.verification_id}`,
    }))
    expect(certificateDownloadUrl('https://prezva.app', 'r1', 'tok 1')).toBe('https://prezva.app/api/certificates/r1?token=tok%201')
  })
})

it('isCertificateServable is confirmed only', () => {
  expect(['confirmed', 'pending', 'waitlisted', 'cancelled', 'refunded', null].map(isCertificateServable))
    .toEqual([true, false, false, false, false, false])
})
