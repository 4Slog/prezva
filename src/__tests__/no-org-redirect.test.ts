// O116: a signed-in user with zero orgs is sent to /me from the org dashboard.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  orgs: [] as unknown[],
  pathname: '/dashboard',
  impersonate: undefined as string | undefined,
  superAdmin: false,
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((to: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${to}` }) }),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-pathname': h.pathname })),
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => (name === 'pz_impersonate_org' && h.impersonate ? { value: h.impersonate } : undefined)),
  })),
}))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => ({ id: 'user-1', email: 'u@x.io', user_metadata: {} })) }))
vi.mock('@/lib/orgs/actions', () => ({ getUserOrgs: vi.fn(async () => h.orgs) }))
vi.mock('@/lib/auth/get-contexts', () => ({ getUserContexts: vi.fn(async () => []) }))
vi.mock('@/lib/notifications/notification-actions', () => ({ getUnreadCount: vi.fn(async () => 0) }))
vi.mock('@/lib/admin/gate', () => ({ isSuperAdmin: vi.fn(() => h.superAdmin) }))
vi.mock('@/lib/auth/assert-permission', () => ({ getOrgPermissions: vi.fn(async () => new Set()) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    const chain: any = {}
    chain.select = () => chain
    chain.eq = () => chain
    chain.maybeSingle = async () => ({ data: null, error: null })
    return { from: () => chain }
  }),
}))
vi.mock('@/components/layout/OrgShell', () => ({ OrgShell: () => null }))
vi.mock('@/components/auth/UserMenu', () => ({ UserMenu: () => null }))
vi.mock('@/components/layout/NotificationBell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/ContextSwitcher', () => ({ ContextSwitcher: () => null }))

import DashboardLayout from '@/app/(dashboard)/layout'
import { redirect } from 'next/navigation'
import { shouldRedirectNoOrgUser } from '@/lib/auth/no-org-redirect'
import { resolveActiveOrgSlug } from '@/lib/auth/active-org'

beforeEach(() => {
  vi.clearAllMocks()
  h.orgs = []
  h.pathname = '/dashboard'
  h.impersonate = undefined
  h.superAdmin = false
})

describe('O116 dashboard layout', () => {
  it('a user with zero orgs is redirected to /me', async () => {
    await expect(DashboardLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/me')
  })

  it.each(['/orgs/new', '/help', '/settings/security'])('zero orgs on %s is not redirected', async (path) => {
    h.pathname = path
    await DashboardLayout({ children: null })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('a user with an org is not redirected', async () => {
    h.orgs = [{ org_id: 'o1', organizations: { slug: 'acme' } }]
    await DashboardLayout({ children: null })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('a super-admin impersonating an org is not redirected', async () => {
    h.superAdmin = true
    h.impersonate = JSON.stringify({ id: 'o9', name: 'Other', slug: 'other' })
    await DashboardLayout({ children: null })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('O116 helpers', () => {
  it('shouldRedirectNoOrgUser', () => {
    expect(shouldRedirectNoOrgUser('/events/x', 0, false)).toBe(true)
    expect(shouldRedirectNoOrgUser('/orgs/new', 0, false)).toBe(false)
    expect(shouldRedirectNoOrgUser('/orgs/newco/settings', 0, false)).toBe(true)
    expect(shouldRedirectNoOrgUser('/events/x', 1, false)).toBe(false)
    expect(shouldRedirectNoOrgUser('/events/x', 0, true)).toBe(false)
  })

  it('resolveActiveOrgSlug tolerates an empty org list', async () => {
    await expect(resolveActiveOrgSlug('user-1', [])).resolves.toBeNull()
  })
})
