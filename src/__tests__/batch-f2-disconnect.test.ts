// Batch F2 (O151, F-R13): integration disconnect needs org.integrations on the
// org that owns the row, never redirects off-site, never touches GHL, and
// surfaces adapter failures.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeDb } from './helpers/fake-db'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u@x.com' },
  allowed: new Set<string>(),
  admin: null as unknown,
  server: null as unknown,
  disconnect: vi.fn(),
}))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => h.user) }))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(async (org: string, user: string, key: string) => {
    if (!h.allowed.has(`${user}:${org}:${key}`)) throw new Error(`no ${key}`)
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.server }))
vi.mock('@/lib/integrations/_shared/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/_shared/registry')>()
  return {
    ...actual,
    getAdapter: (p: string) => {
      if (p === 'zoom') return { provider: 'zoom', displayName: 'Zoom', disconnect: h.disconnect }
      return actual.getAdapter(p)
    },
  }
})

import { POST } from '@/app/api/integrations/[provider]/disconnect/route'
import { googleDriveAdapter } from '@/lib/integrations/google-drive/adapter'
import { GHL_DISCONNECT_REFUSAL, INTEGRATIONS_PERMISSION, NOT_FOUND_OR_FORBIDDEN } from '@/lib/integrations/_shared/connectable'

const ORG = 'org-1'
const OTHER = 'org-2'

function post(provider: string, fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  const req = new Request(`https://prezva.app/api/integrations/${provider}/disconnect`, { method: 'POST', body: fd })
  return POST(req, { params: Promise.resolve({ provider }) })
}

function location(res: Response) {
  return new URL(res.headers.get('location')!)
}

beforeEach(() => {
  h.allowed.clear()
  h.disconnect.mockReset()
  h.admin = createFakeDb({
    org_integrations: [
      { id: 'i1', org_id: ORG, provider: 'zoom' },
      { id: 'i2', org_id: OTHER, provider: 'zoom' },
      { id: 'i3', org_id: ORG, provider: 'ghl' },
    ],
  }).client
})

describe('authorization', () => {
  it('refuses another org without permission there, without calling the adapter', async () => {
    h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    const res = await post('zoom', { orgId: OTHER, returnTo: '/orgs/acme/integrations' })
    expect(res.status).toBe(303)
    expect(location(res).searchParams.get('error')).toBe(NOT_FOUND_OR_FORBIDDEN)
    expect(h.disconnect).not.toHaveBeenCalled()
    // Refused before any service-role read of the other org's integrations.
    expect((h.admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled()
  })

  it('refuses a member without org.integrations', async () => {
    const res = await post('zoom', { orgId: ORG, returnTo: '/orgs/acme/integrations' })
    expect(location(res).searchParams.get('error')).toBe(NOT_FOUND_OR_FORBIDDEN)
    expect(h.disconnect).not.toHaveBeenCalled()
  })

  it('a missing row gets the same message as no permission', async () => {
    h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    const res = await post('google_drive', { orgId: ORG, returnTo: '/x' })
    expect(location(res).searchParams.get('error')).toBe(NOT_FOUND_OR_FORBIDDEN)
  })

  it('with permission on the owning org: disconnects that org and returns', async () => {
    h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    const res = await post('zoom', { orgId: ORG, returnTo: '/orgs/acme/integrations' })
    expect(h.disconnect).toHaveBeenCalledWith(ORG)
    expect(location(res).toString()).toBe('https://prezva.app/orgs/acme/integrations')
  })

  it('ghl is refused explicitly, even with permission', async () => {
    h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    const res = await post('ghl', { orgId: ORG, returnTo: '/orgs/acme/integrations' })
    expect(location(res).searchParams.get('error')).toBe(GHL_DISCONNECT_REFUSAL)
    expect(h.disconnect).not.toHaveBeenCalled()
  })
})

describe('returnTo stays on-site', () => {
  it.each([
    'https://evil.com/x',
    '//evil.com',
    '/\\evil.com',
    '/\t/evil.com',
    'javascript:alert(1)',
    '',
  ])('%j lands on prezva.app', async (returnTo) => {
    h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    const res = await post('zoom', { orgId: ORG, returnTo })
    const url = location(res)
    expect(url.origin).toBe('https://prezva.app')
    expect(url.pathname).toBe('/dashboard')
  })
})

describe('errors surface', () => {
  it('an adapter failure is reported, not swallowed as "Unknown provider"', async () => {
    h.allowed.add(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    h.disconnect.mockRejectedValueOnce(new Error('boom'))
    const res = await post('zoom', { orgId: ORG, returnTo: '/orgs/acme/integrations' })
    const url = location(res)
    expect(url.pathname).toBe('/orgs/acme/integrations')
    expect(url.searchParams.get('error')).toBe('Could not disconnect Zoom. Please try again.')
  })
})

describe('Google Drive adapter disconnect', () => {
  it('clears both tokens', async () => {
    const db = createFakeDb({
      org_integrations: [{ id: 'g1', org_id: ORG, provider: 'google_drive', status: 'connected', encrypted_refresh_token: 'r', encrypted_access_token: 'a', token_expires_at: 'x' }],
    })
    h.server = db.client
    await googleDriveAdapter.disconnect(ORG)
    expect(db.tables.org_integrations[0]).toMatchObject({ status: 'available', encrypted_refresh_token: null, encrypted_access_token: null, token_expires_at: null })
  })

  it('throws when nothing was updated', async () => {
    h.server = createFakeDb({ org_integrations: [] }).client
    await expect(googleDriveAdapter.disconnect(ORG)).rejects.toThrow(/no integration row/)
  })
})
