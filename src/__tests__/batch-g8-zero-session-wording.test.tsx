// Batch G8 (O166, G-R8): with no published sessions, both certificates pages
// state the door-check-in rule instead of the session-percentage rule.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({ db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>, published: 0 }))
vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`) }), notFound: vi.fn(() => { throw new Error('notFound') }) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: 'embed-token' }) })) }))
vi.mock('@/lib/embedded/session', () => ({ COOKIE_NAME: 'pz_embed', verifyEmbeddedSession: vi.fn(async () => ({ location_id: 'loc-1' })) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1' })) }))
vi.mock('@/lib/auth/assert-permission', () => ({ getOrgPermissions: vi.fn(async () => new Set(['*'])) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.db.client }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.db.client }))
vi.mock('@/lib/certificates/published-sessions', () => ({ countPublishedSessions: vi.fn(async () => h.published) }))
vi.mock('@/lib/certificates/issued-counts', () => ({ countIssuedCertificates: vi.fn(async () => null), issuedCountLabel: () => '' }))
vi.mock('@/app/(dashboard)/events/[slug]/certificates/bulk-issue-button', () => ({ default: () => null }))
vi.mock('@/lib/embedded/certificates-actions', () => ({
  embedBulkIssueCertificates: vi.fn(),
  embedGetCertificatesData: vi.fn(async () => ({
    event: { id: 'e1', certificate_enabled: true, certificate_min_session_attendance_pct: 75 },
    publishedSessions: h.published,
    templates: [], issuedCountsByTemplate: {}, totalIssued: 0, issuedCounts: null, confirmedCount: 0,
  })),
}))

import DashboardCertificatesPage from '@/app/(dashboard)/events/[slug]/certificates/page'
import EmbedCertificatesPage from '@/app/embedded/events/[eventId]/certificates/page'

const ZERO = 'Attendees checked in at the door receive an attendance certificate (no CE credits).'

beforeEach(() => {
  h.db = createFakeDb({
    events: [{ id: 'e1', slug: 'conf', title: 'Conf', org_id: 'o1', certificate_enabled: true, certificate_min_session_attendance_pct: 75 }],
    org_members: [{ org_id: 'o1', user_id: 'u1', role: 'owner' }],
    certificate_templates: [],
    registrations: [],
  })
})

const pages = [
  ['dashboard', async () => render(await DashboardCertificatesPage({ params: Promise.resolve({ slug: 'conf' }) }))],
  ['embedded', async () => render(await EmbedCertificatesPage({ params: Promise.resolve({ eventId: 'e1' }) }))],
] as const

describe.each(pages)('%s certificates page', (_n, renderPage) => {
  it('zero published sessions → the door check-in rule', async () => {
    h.published = 0
    await renderPage()
    const line = screen.getByText('Eligibility:').parentElement!
    expect(line).toHaveTextContent(`Eligibility: ${ZERO}`)
    expect(line).not.toHaveTextContent('% of sessions')
  })

  it('with published sessions → the percentage rule, unchanged', async () => {
    h.published = 3
    await renderPage()
    expect(screen.getByText('Eligibility:').parentElement!).toHaveTextContent('Eligibility: Attendees who completed ≥75% of sessions')
    expect(screen.queryByText(ZERO)).not.toBeInTheDocument()
  })
})
