// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── next/headers: mutable cookie jar ─────────────────────────────────────────
let embeddedSessionCookie: string | undefined
const cookieSet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) =>
      name === 'embedded_session' && embeddedSessionCookie !== undefined ? { value: embeddedSessionCookie } : undefined,
    ),
    set: cookieSet,
  })),
}))

// ── embedded session: real location resolution keyed off the mock cookie ────
let sessionLocationId: string | null = 'loc-1'
vi.mock('@/lib/embedded/session', () => ({
  verifyEmbeddedSession: vi.fn(async (token: string) => {
    if (token !== 'valid-embed-token' || sessionLocationId === null) throw new Error('invalid session')
    return { location_id: sessionLocationId }
  }),
  mintEmbeddedSession: vi.fn(async (locationId: string) => `minted:${locationId}`),
  COOKIE_NAME: 'embedded_session',
}))

// ── ephemeral auth client (supabase-js, NOT the SSR/admin clients) ───────────
const mockSignInWithPassword = vi.fn()
const mockSignUp = vi.fn()
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { signInWithPassword: mockSignInWithPassword, signUp: mockSignUp },
  })),
}))

// ── admin client: table-dispatch chain, supports both .maybeSingle()/.single()
// termination AND being awaited directly (Supabase's real builder is thenable) ─
function makeChain(config: { maybeSingle?: any; single?: any; awaited?: any } = {}) {
  const chain: any = {}
  for (const k of ['select', 'eq', 'in', 'insert', 'update', 'delete']) chain[k] = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockResolvedValue(config.maybeSingle ?? { data: null, error: null })
  chain.single = vi.fn().mockResolvedValue(config.single ?? { data: null, error: null })
  const awaited = config.awaited ?? { data: null, error: null }
  chain.then = (resolve: any, reject: any) => Promise.resolve(awaited).then(resolve, reject)
  return chain
}

let mockFromImpl: (table: string) => any
const mockFrom = vi.fn((t: string) => mockFromImpl(t))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('@/lib/auth/assert-permission', () => ({
  hasPermission: vi.fn(),
}))
vi.mock('@/lib/orgs/seed-builtin-roles', () => ({
  seedBuiltinRoles: vi.fn(),
}))
vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn(),
}))
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { claimPendingInstall: vi.fn() },
}))
vi.mock('@/lib/integrations/ghl/provisioner', () => ({
  provisionGhlOrgConfig: vi.fn(),
}))

import { claimSignIn, claimSignUp, getClaimOrgs, claimLocation } from './claim-actions'
import { hasPermission } from '@/lib/auth/assert-permission'
import { seedBuiltinRoles } from '@/lib/orgs/seed-builtin-roles'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { provisionGhlOrgConfig } from '@/lib/integrations/ghl/provisioner'

beforeEach(() => {
  embeddedSessionCookie = 'valid-embed-token'
  sessionLocationId = 'loc-1'
  cookieSet.mockClear()
  mockSignInWithPassword.mockReset()
  mockSignUp.mockReset()
  mockFrom.mockClear()
  vi.mocked(hasPermission).mockReset()
  vi.mocked(seedBuiltinRoles).mockReset()
  vi.mocked(ghlAdapter.claimPendingInstall).mockReset()
  vi.mocked(provisionGhlOrgConfig).mockReset().mockResolvedValue(undefined)
  vi.stubEnv('EMBEDDED_SESSION_SECRET', 'test-secret-at-least-32-bytes-long-1234')
})

// ── sign in / sign up ─────────────────────────────────────────────────────────

describe('claimSignIn', () => {
  it('mints a claim token on valid credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@test.com' } }, error: null })
    const fd = new FormData()
    fd.set('email', 'a@test.com')
    fd.set('password', 'correct-password')

    const result = await claimSignIn(fd)
    expect('ok' in result && result.ok).toBe(true)
    expect((result as any).claimToken).toBeTypeOf('string')
  })

  it('surfaces the auth error on bad credentials', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } })
    const fd = new FormData()
    fd.set('email', 'a@test.com')
    fd.set('password', 'wrong')

    const result = await claimSignIn(fd)
    expect(result).toEqual({ error: 'Invalid login credentials' })
  })
})

describe('claimSignUp', () => {
  it('mints a claim token when signup returns an immediate session', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'b@test.com' }, session: { access_token: 'x' } },
      error: null,
    })
    const fd = new FormData()
    fd.set('email', 'b@test.com')
    fd.set('password', 'password123')
    fd.set('full_name', 'Bea Test')

    const result = await claimSignUp(fd)
    expect('ok' in result && result.ok).toBe(true)
  })

  it('returns confirmEmail when signup requires confirmation (no session yet)', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'user-2', email: 'b@test.com' }, session: null },
      error: null,
    })
    const fd = new FormData()
    fd.set('email', 'b@test.com')
    fd.set('password', 'password123')

    const result = await claimSignUp(fd)
    expect(result).toEqual({ confirmEmail: true })
  })
})

// ── org picker ────────────────────────────────────────────────────────────────

async function getValidClaimToken(): Promise<string> {
  mockSignInWithPassword.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@test.com' } }, error: null })
  const fd = new FormData()
  fd.set('email', 'a@test.com')
  fd.set('password', 'correct-password')
  const result = await claimSignIn(fd)
  return (result as any).claimToken
}

describe('getClaimOrgs', () => {
  it('returns session_expired for a garbage token', async () => {
    const result = await getClaimOrgs('not-a-real-token')
    expect(result).toEqual({ error: 'session_expired' })
  })

  it('returns only orgs where the role holds org.settings', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'org_members') {
        return makeChain({
          awaited: {
            data: [
              { org_id: 'org-a', role_id: 'role-owner', organizations: { id: 'org-a', name: 'Org A' } },
              { org_id: 'org-b', role_id: 'role-staff', organizations: { id: 'org-b', name: 'Org B' } },
            ],
            error: null,
          },
        })
      }
      if (table === 'role_permissions') {
        return makeChain({ awaited: { data: [{ role_id: 'role-owner' }], error: null } })
      }
      return makeChain()
    }

    const result = await getClaimOrgs(claimToken)
    expect(result).toEqual({ orgs: [{ id: 'org-a', name: 'Org A' }] })
  })

  it('returns an empty list when the user has no memberships', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'org_members') return makeChain({ awaited: { data: [], error: null } })
      return makeChain()
    }

    const result = await getClaimOrgs(claimToken)
    expect(result).toEqual({ orgs: [] })
  })
})

// ── claimLocation ─────────────────────────────────────────────────────────────

describe('claimLocation', () => {
  it('returns session_expired for a garbage claim token', async () => {
    const result = await claimLocation('not-a-real-token', { type: 'new', name: 'Acme' })
    expect(result).toEqual({ error: 'session_expired' })
  })

  it('returns session_expired when there is no embedded_session cookie (location cannot be resolved)', async () => {
    const claimToken = await getValidClaimToken()
    embeddedSessionCookie = undefined

    const result = await claimLocation(claimToken, { type: 'new', name: 'Acme' })
    expect(result).toEqual({ error: 'session_expired' })
    expect(ghlAdapter.claimPendingInstall).not.toHaveBeenCalled()
  })

  it('short-circuits when the location is already linked — does not touch claimPendingInstall', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: { org_id: 'org-existing' }, error: null } })
      return makeChain()
    }

    const result = await claimLocation(claimToken, { type: 'new', name: 'Acme' })
    expect(result).toEqual({ ok: true, next: '/embedded/events' })
    expect(ghlAdapter.claimPendingInstall).not.toHaveBeenCalled()
    expect(cookieSet).toHaveBeenCalledWith(
      'embedded_session',
      'minted:loc-1',
      expect.objectContaining({ sameSite: 'none', httpOnly: true, path: '/' }),
    )
  })

  it('returns install_missing when neither a pending install nor a link covers this location', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      if (table === 'ghl_pending_installs') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    }

    const result = await claimLocation(claimToken, { type: 'existing', orgId: 'org-1' })
    expect(result).toEqual({ error: 'install_missing' })
  })

  it('returns forbidden when the user lacks org.settings on the chosen existing org', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      if (table === 'ghl_pending_installs') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-1' }, error: null } })
      return makeChain()
    }
    vi.mocked(hasPermission).mockResolvedValue(false)

    const result = await claimLocation(claimToken, { type: 'existing', orgId: 'org-not-mine' })
    expect(result).toEqual({ error: 'forbidden' })
    expect(ghlAdapter.claimPendingInstall).not.toHaveBeenCalled()
  })

  it('happy path (existing org): binds the pending install, provisions, re-mints the session', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      if (table === 'ghl_pending_installs') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-1' }, error: null } })
      return makeChain()
    }
    vi.mocked(hasPermission).mockResolvedValue(true)
    vi.mocked(ghlAdapter.claimPendingInstall).mockResolvedValue({ accessToken: 'access-xyz' })

    const result = await claimLocation(claimToken, { type: 'existing', orgId: 'org-1' })

    expect(result).toEqual({ ok: true, next: '/embedded/events' })
    // CRITICAL: the location passed to claimPendingInstall is the session's
    // location (loc-1), never anything the caller could have supplied.
    expect(ghlAdapter.claimPendingInstall).toHaveBeenCalledWith('loc-1', 'org-1')
    expect(provisionGhlOrgConfig).toHaveBeenCalledWith(expect.anything(), 'access-xyz', 'org-1', 'loc-1')
    expect(cookieSet).toHaveBeenCalledWith('embedded_session', 'minted:loc-1', expect.objectContaining({ sameSite: 'none' }))
  })

  it('uses the session-attested location even when a different location is implied elsewhere', async () => {
    sessionLocationId = 'loc-from-session-only'
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      if (table === 'ghl_pending_installs') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-from-session-only' }, error: null } })
      return makeChain()
    }
    vi.mocked(hasPermission).mockResolvedValue(true)
    vi.mocked(ghlAdapter.claimPendingInstall).mockResolvedValue({ accessToken: 'access-xyz' })

    await claimLocation(claimToken, { type: 'existing', orgId: 'org-1' })

    expect(ghlAdapter.claimPendingInstall).toHaveBeenCalledWith('loc-from-session-only', 'org-1')
  })

  it('happy path (new org): creates the org (no invite gate), seeds roles, adds owner membership, then binds', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      if (table === 'ghl_pending_installs') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-1' }, error: null } })
      if (table === 'organizations') {
        return makeChain({
          maybeSingle: { data: null, error: null }, // slug free
          single: { data: { id: 'new-org-id' }, error: null }, // insert result
        })
      }
      if (table === 'org_members') return makeChain({ awaited: { data: null, error: null } })
      return makeChain()
    }
    vi.mocked(seedBuiltinRoles).mockResolvedValue('owner-role-id')
    vi.mocked(ghlAdapter.claimPendingInstall).mockResolvedValue({ accessToken: 'access-xyz' })

    const result = await claimLocation(claimToken, { type: 'new', name: 'Acme Events' })

    expect(result).toEqual({ ok: true, next: '/embedded/events' })
    expect(seedBuiltinRoles).toHaveBeenCalledWith('new-org-id', expect.anything())
    expect(ghlAdapter.claimPendingInstall).toHaveBeenCalledWith('loc-1', 'new-org-id')
    expect(hasPermission).not.toHaveBeenCalled()
  })

  it('rejects an org name that is too short without touching the DB', async () => {
    const claimToken = await getValidClaimToken()
    mockFromImpl = (table) => {
      if (table === 'ghl_location_links') return makeChain({ maybeSingle: { data: null, error: null } })
      if (table === 'ghl_pending_installs') return makeChain({ maybeSingle: { data: { ghl_location_id: 'loc-1' }, error: null } })
      return makeChain()
    }

    const result = await claimLocation(claimToken, { type: 'new', name: 'A' })
    expect(result).toEqual({ error: 'Organization name is too short.' })
    expect(ghlAdapter.claimPendingInstall).not.toHaveBeenCalled()
  })
})
