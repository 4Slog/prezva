// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCookieSet } = vi.hoisted(() => ({ mockCookieSet: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({ set: mockCookieSet }),
}))

vi.mock('@/lib/embedded/session', () => ({
  mintEmbeddedSession: vi.fn().mockResolvedValue('signed-jwt-token'),
  COOKIE_NAME: 'embedded_session',
}))

vi.mock('@/lib/embedded/sso', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/embedded/sso')>()
  return { ...actual, decryptSsoPayload: vi.fn() }
})

vi.mock('@/lib/embedded/sso-nonce', () => ({
  hashSsoPayload: vi.fn((s: string) => `hash:${s}`),
  claimSsoNonce: vi.fn(),
}))

vi.mock('@/lib/integrations/ghl/config', () => ({
  isGhlEventsEnabled: vi.fn().mockReturnValue(true),
}))

import { POST } from './route'
import { mintEmbeddedSession } from '@/lib/embedded/session'
import { decryptSsoPayload, SsoConfigError } from '@/lib/embedded/sso'
import { hashSsoPayload, claimSsoNonce } from '@/lib/embedded/sso-nonce'
import { isGhlEventsEnabled } from '@/lib/integrations/ghl/config'

const BASE_URL = 'http://localhost/api/embedded/sso'

function makeRequest(body: object) {
  return new NextRequest(BASE_URL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

beforeEach(() => {
  vi.mocked(isGhlEventsEnabled).mockReturnValue(true)
  mockCookieSet.mockClear()
  vi.mocked(mintEmbeddedSession).mockClear().mockResolvedValue('signed-jwt-token')
  vi.mocked(decryptSsoPayload).mockClear()
  vi.mocked(hashSsoPayload).mockClear()
  vi.mocked(claimSsoNonce).mockClear().mockResolvedValue({ ok: true })
})

afterEach(() => {
  // Keep the NODE_ENV stub from the CHIPS production-branch test below from
  // leaking into any other test in this file.
  vi.unstubAllEnvs()
})

describe('POST /api/embedded/sso', () => {
  it('mints the embedded session cookie and returns 200 on a valid decrypt', async () => {
    vi.mocked(decryptSsoPayload).mockReturnValue({
      locationId: 'loc_123',
      email: 'user@example.com',
    })

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true, next: '/embedded/events' })
    expect(hashSsoPayload).toHaveBeenCalledWith('encrypted-blob')
    expect(claimSsoNonce).toHaveBeenCalledWith('hash:encrypted-blob')
    expect(mintEmbeddedSession).toHaveBeenCalledWith('loc_123', 'user@example.com')
    // partitioned/secure are `false` here, not `true`, because vitest runs with
    // NODE_ENV='test' and both options are `NODE_ENV === 'production'`. This
    // case pins the wiring (the option is passed at all, and tracks the env);
    // the production behaviour itself is covered by the stubbed test below.
    expect(mockCookieSet).toHaveBeenCalledWith(
      'embedded_session',
      'signed-jwt-token',
      expect.objectContaining({ httpOnly: true, path: '/', sameSite: 'none', secure: false, partitioned: false }),
    )
  })

  it('sets Partitioned and Secure when NODE_ENV is production (CHIPS, O70)', async () => {
    vi.mocked(decryptSsoPayload).mockReturnValue({
      locationId: 'loc_123',
      email: 'user@example.com',
    })
    vi.stubEnv('NODE_ENV', 'production')

    await POST(makeRequest({ encryptedData: 'encrypted-blob' }))

    // Without Partitioned this cookie is a plain third-party cookie set from
    // inside the GHL iframe — Safari drops it outright and Chrome drops it in
    // incognito, which is exactly the O70 failure.
    expect(mockCookieSet).toHaveBeenCalledWith(
      'embedded_session',
      'signed-jwt-token',
      expect.objectContaining({ sameSite: 'none', secure: true, partitioned: true }),
    )
  })

  it('returns next=/embedded/events — the value sso/page.tsx appends its sso=1 separator to', async () => {
    vi.mocked(decryptSsoPayload).mockReturnValue({
      locationId: 'loc_123',
      email: 'user@example.com',
    })

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))
    const json = await res.json()

    // sso/page.tsx picks '?' vs '&' off this string. If it ever grows a query
    // string, that separator logic is what has to keep up.
    expect(json.next).toBe('/embedded/events')
  })

  it('returns 401 replay and mints no session/cookie when the payload hash was already claimed', async () => {
    vi.mocked(decryptSsoPayload).mockReturnValue({
      locationId: 'loc_123',
      email: 'user@example.com',
    })
    vi.mocked(claimSsoNonce).mockResolvedValue({ ok: false, reason: 'replay' })

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json).toEqual({ error: 'replay' })
    expect(mintEmbeddedSession).not.toHaveBeenCalled()
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('returns 500 and mints no session/cookie when the nonce claim itself errors', async () => {
    vi.mocked(decryptSsoPayload).mockReturnValue({
      locationId: 'loc_123',
      email: 'user@example.com',
    })
    vi.mocked(claimSsoNonce).mockResolvedValue({ ok: false, reason: 'error' })

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))

    expect(res.status).toBe(500)
    expect(mintEmbeddedSession).not.toHaveBeenCalled()
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('returns 401 when the decrypted payload has no location id', async () => {
    vi.mocked(decryptSsoPayload).mockImplementation(() => {
      throw new Error('SSO payload missing location id')
    })

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))

    expect(res.status).toBe(401)
    expect(mintEmbeddedSession).not.toHaveBeenCalled()
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  it('returns 401 when the payload fails to decrypt', async () => {
    vi.mocked(decryptSsoPayload).mockImplementation(() => {
      throw new Error('bad decrypt')
    })

    const res = await POST(makeRequest({ encryptedData: 'garbage' }))

    expect(res.status).toBe(401)
  })

  it('returns 500 with a clear error when GHL_APP_SSO_KEY is unset', async () => {
    vi.mocked(decryptSsoPayload).mockImplementation(() => {
      throw new SsoConfigError('GHL_APP_SSO_KEY is not set')
    })

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toMatch(/misconfigured/i)
    expect(mintEmbeddedSession).not.toHaveBeenCalled()
  })

  it('returns 400 when encryptedData is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(decryptSsoPayload).not.toHaveBeenCalled()
  })

  it('returns 404 when GHL events are disabled', async () => {
    vi.mocked(isGhlEventsEnabled).mockReturnValue(false)

    const res = await POST(makeRequest({ encryptedData: 'encrypted-blob' }))

    expect(res.status).toBe(404)
    expect(decryptSsoPayload).not.toHaveBeenCalled()
  })
})
