// Batch E5 (E-R5, E-R7): signed OAuth state bound to user + org + provider
// with expiry; org.integrations required in auth AND callback; only GHL and
// Google Drive can be connected. E-R7 gate: the GHL marketplace install and a
// GHL (re)connect started from the Integrations page both still complete.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  user: { id: 'u1', email: 'u@x.com' } as { id: string; email: string },
  allowed: new Set<string>(),
  cookies: new Map<string, string>(),
  driveCallback: vi.fn(),
  ghlCallback: vi.fn(),
  ghlPending: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/get-user', () => ({ requireUser: vi.fn(async () => h.user) }))
vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(async (org: string, user: string, key: string) => {
    if (!h.allowed.has(`${user}:${org}:${key}`)) throw new Error(`no ${key}`)
  }),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (n: string) => (h.cookies.has(n) ? { value: h.cookies.get(n)! } : undefined),
    set: (n: string, v: string) => { h.cookies.set(n, v) },
    delete: (n: string) => { h.cookies.delete(n) },
  })),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: 'acme' }, error: null }) }) }) }) }),
}))
vi.mock('@/lib/integrations/_shared/registry', async () => {
  const mk = (provider: string, displayName: string, handleCallback = vi.fn()) => ({
    provider, displayName, isConfigured: () => true, handleCallback,
    getAuthUrl: (_o: string, redirect: string, state: string) =>
      `https://auth.example/${provider}?redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`,
  })
  const adapters: Record<string, ReturnType<typeof mk>> = {
    google_drive: mk('google_drive', 'Google Drive', h.driveCallback),
    zoom: mk('zoom', 'Zoom'),
    constant_contact: mk('constant_contact', 'Constant Contact'),
    eventbrite: mk('eventbrite', 'Eventbrite'),
    outlook: mk('outlook', 'Outlook'),
    google_forms: mk('google_forms', 'Google Forms'),
    teams: mk('teams', 'Teams'),
  }
  return { getAdapter: (p: string) => { if (!adapters[p]) throw new Error('unknown'); return adapters[p] }, listAdapters: () => Object.values(adapters) }
})
vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: {
    handlePendingInstall: h.ghlPending,
    handleCallback: h.ghlCallback,
    getAuthUrl: (_o: string, redirect: string, state: string) =>
      `https://marketplace.gohighlevel.com/oauth/chooselocation?redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}`,
  },
  REDIRECT_URI: 'https://prezva.app/api/oauth/callback',
  STATE_COOKIE: 'ghl_oauth_state',
}))

import { signOAuthState, verifyOAuthState, OAUTH_STATE_TTL_SECONDS } from '@/lib/integrations/_shared/oauth-state'
import { INTEGRATIONS_PERMISSION } from '@/lib/integrations/_shared/connectable'
import { GET as authGET } from '@/app/api/integrations/[provider]/auth/route'
import { GET as callbackGET } from '@/app/api/integrations/[provider]/callback/route'
import { GET as ghlStartGET } from '@/app/api/oauth/start/route'
import { GET as ghlCallbackGET } from '@/app/api/oauth/callback/route'
import { IntegrationsClient, ghlConnectHref } from '@/app/(dashboard)/orgs/[slug]/integrations/integrations-client'

const ORG = 'org-1'
const params = (provider: string) => ({ params: Promise.resolve({ provider }) })
const loc = (res: Response) => res.headers.get('location') ?? ''
const stateFrom = (url: string) => new URL(url).searchParams.get('state')!

const KEY = process.env.INTEGRATION_ENCRYPTION_KEY
beforeEach(() => {
  process.env.INTEGRATION_ENCRYPTION_KEY = 'test-integration-encryption-key-0123456789abcdef'
  delete process.env.INTEGRATION_STATE_SECRET
  h.user = { id: 'u1', email: 'u@x.com' }
  h.allowed = new Set([`u1:${ORG}:${INTEGRATIONS_PERMISSION}`, `u1:${ORG}:org.settings`])
  h.cookies.clear()
  h.driveCallback.mockReset().mockResolvedValue(undefined)
  h.ghlCallback.mockReset().mockResolvedValue(undefined)
  h.ghlPending.mockReset().mockResolvedValue({ stored: true })
})
afterEach(() => { process.env.INTEGRATION_ENCRYPTION_KEY = KEY })

describe('signed OAuth state', () => {
  it('round-trips for the same provider and user', () => {
    const s = signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' })
    expect(verifyOAuthState(s, { provider: 'google_drive', userId: 'u1' })).toEqual({ ok: true, orgId: ORG })
  })

  it('refuses a forged (unsigned base64) state, a tampered org, another user, another provider and an expired one', () => {
    const forged = Buffer.from(JSON.stringify({ orgId: ORG, userId: 'u1' })).toString('base64url')
    expect(verifyOAuthState(forged, { provider: 'google_drive', userId: 'u1' })).toMatchObject({ ok: false })
    const s = signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' })
    const [body, mac] = s.split('.')
    const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), orgId: 'victim-org' })).toString('base64url')
    expect(verifyOAuthState(`${tampered}.${mac}`, { provider: 'google_drive', userId: 'u1' })).toEqual({ ok: false, reason: 'signature' })
    expect(verifyOAuthState(s, { provider: 'google_drive', userId: 'u2' })).toEqual({ ok: false, reason: 'user' })
    expect(verifyOAuthState(s, { provider: 'zoom', userId: 'u1' })).toEqual({ ok: false, reason: 'provider' })
    const later = Date.now() + (OAUTH_STATE_TTL_SECONDS + 5) * 1000
    expect(verifyOAuthState(s, { provider: 'google_drive', userId: 'u1' }, later)).toEqual({ ok: false, reason: 'expired' })
  })

  it('a configured-but-short INTEGRATION_STATE_SECRET fails closed instead of falling back', () => {
    process.env.INTEGRATION_STATE_SECRET = 'too-short'
    expect(() => signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' })).toThrow()
    delete process.env.INTEGRATION_STATE_SECRET
  })

  it('fails closed with no secret configured', () => {
    const s = signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' })
    delete process.env.INTEGRATION_ENCRYPTION_KEY
    expect(() => signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' })).toThrow()
    expect(verifyOAuthState(s, { provider: 'google_drive', userId: 'u1' })).toEqual({ ok: false, reason: 'unconfigured' })
  })
})

describe('/api/integrations/[provider]/auth', () => {
  it('Google Drive: with org.integrations, redirects to the provider with a signed state', async () => {
    const res = await authGET(new NextRequest(`https://prezva.app/api/integrations/google_drive/auth?org_id=${ORG}`), params('google_drive'))
    expect(loc(res)).toMatch(/^https:\/\/auth\.example\/google_drive/)
    expect(verifyOAuthState(stateFrom(loc(res)), { provider: 'google_drive', userId: 'u1' })).toEqual({ ok: true, orgId: ORG })
  })

  it('a user without org.integrations is refused before any provider redirect', async () => {
    h.allowed.delete(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    const res = await authGET(new NextRequest(`https://prezva.app/api/integrations/google_drive/auth?org_id=${ORG}`), params('google_drive'))
    expect(loc(res)).toMatch(/^https:\/\/prezva\.app\/dashboard\?error=/)
    expect(new URL(loc(res)).searchParams.get('error')).toContain('permission')
  })

  it.each(['zoom', 'teams', 'constant_contact', 'eventbrite', 'outlook', 'google_forms'])('hidden provider %s is refused', async (p) => {
    const res = await authGET(new NextRequest(`https://prezva.app/api/integrations/${p}/auth?org_id=${ORG}`), params(p))
    expect(loc(res)).not.toContain('auth.example')
    expect(new URL(loc(res)).searchParams.get('error')).toContain('not available yet')
  })

  it.each(['https://evil.example/x', '//evil.example', '/\\evil.example', '/%09/evil.example', '/%0a/evil.example', '/%0d/evil.example'])(
    'return_to %s cannot point off-site', async (rt) => {
      const res = await authGET(new NextRequest(`https://prezva.app/api/integrations/mailchimp/auth?org_id=${ORG}&return_to=${rt}`), params('mailchimp'))
      expect(new URL(loc(res)).origin).toBe('https://prezva.app')
    })
})

describe('/api/integrations/[provider]/callback', () => {
  const cb = (provider: string, state: string) =>
    callbackGET(new NextRequest(`https://prezva.app/api/integrations/${provider}/callback?code=c1&state=${encodeURIComponent(state)}`), params(provider))

  it('a valid state connects the org it names', async () => {
    const res = await cb('google_drive', signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' }))
    expect(h.driveCallback).toHaveBeenCalledWith('c1', ORG, 'https://prezva.app/api/integrations/google_drive/callback')
    expect(loc(res)).toBe('https://prezva.app/orgs/acme/integrations?connected=google_drive')
  })

  it('forged, expired and other-user states never reach the provider exchange', async () => {
    const forged = Buffer.from(JSON.stringify({ orgId: 'victim-org', userId: 'u1' })).toString('base64url')
    await cb('google_drive', forged)
    const past = Date.now() - (OAUTH_STATE_TTL_SECONDS + 5) * 1000
    await cb('google_drive', signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' }, past))
    await cb('google_drive', signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'attacker' }))
    expect(h.driveCallback).not.toHaveBeenCalled()
  })

  it('a user who lost org.integrations after starting is refused', async () => {
    const state = signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' })
    h.allowed.delete(`u1:${ORG}:${INTEGRATIONS_PERMISSION}`)
    await cb('google_drive', state)
    expect(h.driveCallback).not.toHaveBeenCalled()
  })

  it('a provider error is mapped to a fixed message, never echoed', async () => {
    const res = await callbackGET(new NextRequest('https://prezva.app/api/integrations/google_drive/callback?error=Your%20account%20is%20suspended'), params('google_drive'))
    expect(new URL(loc(res)).searchParams.get('error')).toBe('The provider could not complete the connection. Please try again.')
  })

  it('an exchange failure returns to the org’s Integrations page with ?error=', async () => {
    h.driveCallback.mockRejectedValueOnce(new Error('boom'))
    const res = await cb('google_drive', signOAuthState({ provider: 'google_drive', orgId: ORG, userId: 'u1' }))
    const url = new URL(loc(res))
    expect(url.pathname).toBe('/orgs/acme/integrations')
    expect(url.searchParams.get('error')).toContain('Could not connect Google Drive')
  })

  it('a hidden provider’s callback is refused even with a well-signed state', async () => {
    const res = await cb('zoom', signOAuthState({ provider: 'zoom', orgId: ORG, userId: 'u1' }))
    expect(new URL(loc(res)).searchParams.get('error')).toContain('not available yet')
  })
})

// ── E-R7: GoHighLevel must keep connecting ───────────────────────────────────
describe('E-R7 GHL regression gate', () => {
  it('marketplace cold install (no state, no cookie, no session) still parks the install', async () => {
    const { requireUser } = await import('@/lib/auth/get-user')
    vi.mocked(requireUser).mockClear()
    const res = await ghlCallbackGET(new NextRequest('https://prezva.app/api/oauth/callback?code=market-code'))
    expect(h.ghlPending).toHaveBeenCalledWith('market-code', 'https://prezva.app/api/oauth/callback')
    expect(requireUser).not.toHaveBeenCalled()
    expect(await res.text()).toContain('Prezva installed')
  })

  it('reconnect from the Integrations page: the GHL card links to /api/oauth/start, and start → callback binds the org', async () => {
    render(<IntegrationsClient ghl={{ status: 'connected' }} sections={[]} orgId={ORG} orgSlug="acme" mailchimpLists={[]} defaultMailchimpListId={null} />)
    const link = screen.getByRole('link', { name: 'Reconnect' })
    expect(link.getAttribute('href')).toBe(ghlConnectHref(ORG))
    expect(ghlConnectHref(ORG)).toBe(`/api/oauth/start?org_id=${ORG}`)

    const start = await ghlStartGET(new NextRequest(`https://prezva.app${ghlConnectHref(ORG)}`))
    expect(loc(start)).toMatch(/^https:\/\/marketplace\.gohighlevel\.com\//)
    expect(h.cookies.get('ghl_oauth_state')).toBeTruthy()

    const back = await ghlCallbackGET(new NextRequest(`https://prezva.app/api/oauth/callback?code=ghl-code&state=${encodeURIComponent(stateFrom(loc(start)))}`))
    expect(h.ghlCallback).toHaveBeenCalledWith('ghl-code', ORG, 'https://prezva.app/api/oauth/callback')
    expect(loc(back)).toBe('https://prezva.app/dashboard?connected=ghl')
  })

  it('first connect shows "Connect" and uses the same flow', () => {
    render(<IntegrationsClient ghl={{ status: null }} sections={[]} orgId={ORG} orgSlug="acme" mailchimpLists={[]} defaultMailchimpListId={null} />)
    expect(screen.getByRole('link', { name: 'Connect' }).getAttribute('href')).toBe(`/api/oauth/start?org_id=${ORG}`)
  })

  it('a non-Drive provider card has no Connect link; Drive does', () => {
    const row = (provider: string, isConnectable: boolean) => ({
      provider, displayName: provider, statusKey: 'available', badge: { label: 'Available', bg: '', color: '' },
      isConfigured: true, isConnectable, isConnected: false, lastSyncedAt: null, hasVerifyMembership: false,
    })
    render(<IntegrationsClient ghl={{ status: 'connected' }} sections={[{ title: 'X', integrations: [row('zoom', false), row('google_drive', true)] }]} orgId={ORG} orgSlug="acme" mailchimpLists={[]} defaultMailchimpListId={null} />)
    const hrefs = screen.getAllByRole('link').map(a => a.getAttribute('href'))
    expect(hrefs).toContain(`/api/integrations/google_drive/auth?org_id=${ORG}&return_to=${encodeURIComponent('/orgs/acme/integrations')}`)
    expect(hrefs.some(h => h?.includes('/zoom/'))).toBe(false)
    expect(screen.getByText('Not available yet')).toBeTruthy()
  })
})
