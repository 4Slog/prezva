// Batch H4 (O172, H-R4): the dashboard checklist's "Connect an integration"
// item completes on a connected integration ('active' is not a status value),
// and a failed read never marks it complete.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof import('./helpers/fake-db').createFakeDb>,
  items: [] as { label: string; done: boolean }[],
  failIntegrations: false,
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`) }) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'u1', email: 'u@x.com' })) }))
vi.mock('@/lib/orgs/actions', () => ({ getUserOrgs: vi.fn(async () => [{ role: 'owner', organizations: { id: 'o1', slug: 'acme', name: 'Acme' } }]) }))
vi.mock('@/lib/auth/active-org', () => ({ resolveActiveOrgSlug: vi.fn(async () => 'acme') }))
vi.mock('@/lib/admin/gate', () => ({ isSuperAdmin: () => false }))
vi.mock('@/components/dashboard/SetupChecklist', () => ({
  SetupChecklist: (p: { items: { label: string; done: boolean }[] }) => { h.items = p.items; return null },
}))
vi.mock('@/components/staff/StaffOnboardingModal', () => ({ StaffOnboardingModal: () => null }))
vi.mock('@/components/identity/HandleNudge', () => ({ HandleNudge: () => null }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...h.db.client,
    from: (t: string) => {
      if (t === 'org_integrations' && h.failIntegrations) {
        const q: Record<string, unknown> = {}
        q.select = () => q
        q.eq = () => q
        q.limit = async () => ({ data: null, error: { message: 'invalid input value for enum integration_status' } })
        return q
      }
      return h.db.client.from(t)
    },
  }),
}))

import { render } from '@testing-library/react'
import DashboardPage from '@/app/(dashboard)/dashboard/page'

const integrationItem = () => h.items.find(i => i.label.startsWith('Connect an integration'))

async function renderPage() {
  render(await DashboardPage({ searchParams: Promise.resolve({}) }))
}

beforeEach(() => {
  h.items = []
  h.failIntegrations = false
  h.db = createFakeDb({
    profiles: [{ id: 'u1', full_name: 'U' }],
    events: [],
    org_members: [{ id: 'm1', org_id: 'o1', user_id: 'u1' }],
    organizations: [{ id: 'o1', charges_enabled: false }],
    org_integrations: [{ id: 'i1', org_id: 'o1', provider: 'google_drive', status: 'connected' }],
  })
})

describe('dashboard checklist — integration item', () => {
  it('a connected integration completes it', async () => {
    await renderPage()
    expect(integrationItem()).toMatchObject({ done: true })
  })

  it('no connected integration leaves it open', async () => {
    h.db.tables.org_integrations[0].status = 'error'
    await renderPage()
    expect(integrationItem()).toMatchObject({ done: false })
  })

  it('a query error does not complete it', async () => {
    h.failIntegrations = true
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await renderPage()
    expect(integrationItem()).toMatchObject({ done: false })
    expect(err).toHaveBeenCalledWith('[dashboard] integration checklist read failed', expect.any(String))
    err.mockRestore()
  })
})
