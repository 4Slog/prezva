// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let cookieValue: string | undefined
const cookieDelete = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) =>
      name === 'ghl_oauth_state' && cookieValue !== undefined ? { value: cookieValue } : undefined,
    ),
    delete: cookieDelete,
  })),
}))

vi.mock('@/lib/integrations/ghl/adapter', () => ({
  ghlAdapter: { handlePendingInstall: vi.fn(), handleCallback: vi.fn() },
  REDIRECT_URI: 'https://prezva.app/api/oauth/callback',
  STATE_COOKIE: 'ghl_oauth_state',
}))

vi.mock('@/lib/auth/get-user', () => ({
  requireUser: vi.fn(),
}))

vi.mock('@/lib/auth/assert-permission', () => ({
  assertPermission: vi.fn(),
}))

import { GET } from './route'
import { ghlAdapter } from '@/lib/integrations/ghl/adapter'
import { requireUser } from '@/lib/auth/get-user'
import { assertPermission } from '@/lib/auth/assert-permission'

const BASE_URL = 'https://prezva.app/api/oauth/callback'

function buildState(orgId: string, userId: string, nonce: string): string {
  return Buffer.from(JSON.stringify({ orgId, userId, nonce })).toString('base64url')
}

beforeEach(() => {
  cookieValue = undefined
  cookieDelete.mockClear()
  vi.mocked(ghlAdapter.handlePendingInstall).mockReset().mockResolvedValue(undefined)
  vi.mocked(ghlAdapter.handleCallback).mockReset().mockResolvedValue(undefined)
  vi.mocked(requireUser).mockReset().mockResolvedValue({ id: 'user-1', email: 'user@test.com' } as any)
  vi.mocked(assertPermission).mockReset().mockResolvedValue(undefined)
})

describe('GET /api/oauth/callback — fully state-less arrival (marketplace cold install)', () => {
  it('exchanges the code via handlePendingInstall WITHOUT calling requireUser, and renders the install page', async () => {
    // No state query param, no state cookie.
    const req = new NextRequest(`${BASE_URL}?code=raw-marketplace-code`)
    const res = await GET(req)

    expect(requireUser).not.toHaveBeenCalled()
    expect(ghlAdapter.handlePendingInstall).toHaveBeenCalledWith(
      'raw-marketplace-code',
      'https://prezva.app/api/oauth/callback',
    )
    expect(ghlAdapter.handleCallback).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Prezva installed')
  })

  it('still renders the install page even if handlePendingInstall throws (never surfaces the error to the marketplace)', async () => {
    vi.mocked(ghlAdapter.handlePendingInstall).mockRejectedValue(new Error('token exchange failed'))
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const req = new NextRequest(`${BASE_URL}?code=raw-marketplace-code`)
    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(requireUser).not.toHaveBeenCalled()
    consoleErr.mockRestore()
  })
})

describe('GET /api/oauth/callback — partial state is still rejected', () => {
  it('state param present, no cookie -> invalid-state redirect (requireUser still runs, as today)', async () => {
    cookieValue = undefined
    const state = buildState('org-1', 'user-1', 'nonce-abc')
    const req = new NextRequest(`${BASE_URL}?code=some-code&state=${state}`)
    const res = await GET(req)

    expect(requireUser).toHaveBeenCalledOnce()
    expect(ghlAdapter.handlePendingInstall).not.toHaveBeenCalled()
    expect(ghlAdapter.handleCallback).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard?error=')
  })

  it('cookie present, no state param -> invalid-state redirect (requireUser still runs, as today)', async () => {
    cookieValue = 'nonce-abc'
    const req = new NextRequest(`${BASE_URL}?code=some-code`)
    const res = await GET(req)

    expect(requireUser).toHaveBeenCalledOnce()
    expect(ghlAdapter.handlePendingInstall).not.toHaveBeenCalled()
    expect(ghlAdapter.handleCallback).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard?error=')
  })
})

describe('GET /api/oauth/callback — fully state-ful arrival (unchanged)', () => {
  it('validates nonce + org access and calls handleCallback exactly as before', async () => {
    cookieValue = 'nonce-abc'
    const state = buildState('org-1', 'user-1', 'nonce-abc')
    const req = new NextRequest(`${BASE_URL}?code=real-code&state=${state}`)
    const res = await GET(req)

    expect(requireUser).toHaveBeenCalledOnce()
    expect(assertPermission).toHaveBeenCalledWith('org-1', 'user-1', 'org.settings')
    expect(ghlAdapter.handleCallback).toHaveBeenCalledWith(
      'real-code', 'org-1', 'https://prezva.app/api/oauth/callback',
    )
    expect(ghlAdapter.handlePendingInstall).not.toHaveBeenCalled()
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/dashboard?connected=ghl')
  })

  it('rejects a nonce mismatch (confused-deputy guard, unchanged)', async () => {
    cookieValue = 'nonce-real'
    const state = buildState('org-1', 'user-1', 'nonce-forged')
    const req = new NextRequest(`${BASE_URL}?code=real-code&state=${state}`)
    const res = await GET(req)

    expect(ghlAdapter.handleCallback).not.toHaveBeenCalled()
    expect(res.headers.get('location')).toContain('/dashboard?error=')
  })
})
