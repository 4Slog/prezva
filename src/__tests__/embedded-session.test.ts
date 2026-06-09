// @vitest-environment node
// jose uses Uint8Array instanceof checks that fail in jsdom's non-Node realm.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildEmbeddedCsp, mintEmbeddedSession, verifyEmbeddedSession } from '@/lib/embedded/session'
import { authorizeLaunch } from '@/lib/embedded/auth'

const TEST_SECRET = 'test-embed-launch-secret-32-chars!!'
const TEST_LOCATION = 'loc_configured_123'

// Provide test env so getSecret() and authorizeLaunch don't throw/fail-closed by default
beforeEach(() => {
  vi.stubEnv('EMBEDDED_SESSION_SECRET', 'test-secret-that-is-at-least-32-chars-long!')
  vi.stubEnv('GHL_EMBED_LAUNCH_SECRET', TEST_SECRET)
  vi.stubEnv('GHL_LOCATION_ID', TEST_LOCATION)
})

// ── buildEmbeddedCsp ──────────────────────────────────────────────────────────

describe('buildEmbeddedCsp', () => {
  it('always includes app.gohighlevel.com', () => {
    const csp = buildEmbeddedCsp()
    expect(csp).toContain('https://app.gohighlevel.com')
  })

  it('returns a frame-ancestors directive', () => {
    const csp = buildEmbeddedCsp()
    expect(csp.startsWith('frame-ancestors ')).toBe(true)
  })

  it('appends extra origins', () => {
    const csp = buildEmbeddedCsp(['https://app.myagency.com', 'https://crm.partner.com'])
    expect(csp).toContain('https://app.myagency.com')
    expect(csp).toContain('https://crm.partner.com')
  })

  it('filters empty strings from extra origins', () => {
    const csp = buildEmbeddedCsp(['', '  ', 'https://example.com'])
    const origins = csp.replace('frame-ancestors ', '').trim().split(' ')
    expect(origins.some((o) => o.trim() === '')).toBe(false)
  })

  it('does not affect standalone (no frame-ancestors on a hypothetical standalone path)', () => {
    // buildEmbeddedCsp is ONLY called for /embedded paths in middleware.
    // This test verifies it returns a well-formed directive and nothing else —
    // standalone paths never call this function.
    const csp = buildEmbeddedCsp()
    expect(csp).not.toContain('default-src')
    expect(csp).not.toContain("'self'")
  })
})

// ── mintEmbeddedSession / verifyEmbeddedSession ───────────────────────────────

describe('mintEmbeddedSession + verifyEmbeddedSession', () => {
  it('round-trips location_id', async () => {
    const token = await mintEmbeddedSession('loc_abc123')
    const payload = await verifyEmbeddedSession(token)
    expect(payload.location_id).toBe('loc_abc123')
  })

  it('round-trips optional user_email', async () => {
    const token = await mintEmbeddedSession('loc_abc123', 'user@example.com')
    const payload = await verifyEmbeddedSession(token)
    expect(payload.user_email).toBe('user@example.com')
  })

  it('omits user_email when not provided', async () => {
    const token = await mintEmbeddedSession('loc_xyz')
    const payload = await verifyEmbeddedSession(token)
    expect(payload.user_email).toBeUndefined()
  })

  it('fails verification on a tampered token', async () => {
    const token = await mintEmbeddedSession('loc_abc123')
    // Replace the signature segment (third dot-separated part) with garbage
    const parts = token.split('.')
    parts[2] = parts[2].split('').reverse().join('') // reverse the signature bytes
    const tampered = parts.join('.')
    await expect(verifyEmbeddedSession(tampered)).rejects.toThrow()
  })

  it('fails verification when signed with a different secret', async () => {
    const token = await mintEmbeddedSession('loc_abc123')
    // Re-stub with a different secret before verifying
    vi.stubEnv('EMBEDDED_SESSION_SECRET', 'completely-different-secret-value-here!!')
    await expect(verifyEmbeddedSession(token)).rejects.toThrow()
  })

  it('fails verification on an expired token', async () => {
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-secret-that-is-at-least-32-chars-long!')
    // Mint a token that expired 1 second ago
    const expired = await new SignJWT({ location_id: 'loc_old' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 10)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 5)
      .sign(secret)
    await expect(verifyEmbeddedSession(expired)).rejects.toThrow()
  })
})

// ── authorizeLaunch ───────────────────────────────────────────────────────────

describe('authorizeLaunch', () => {
  it('accepts when secret and location_id are both correct', () => {
    const result = authorizeLaunch({ secret: TEST_SECRET, locationId: TEST_LOCATION })
    expect(result.ok).toBe(true)
  })

  it('rejects when secret is missing (null)', () => {
    const result = authorizeLaunch({ secret: null, locationId: TEST_LOCATION })
    expect(result.ok).toBe(false)
  })

  it('rejects when secret is missing (undefined)', () => {
    const result = authorizeLaunch({ secret: undefined, locationId: TEST_LOCATION })
    expect(result.ok).toBe(false)
  })

  it('rejects when secret is wrong', () => {
    const result = authorizeLaunch({ secret: 'wrong-secret', locationId: TEST_LOCATION })
    expect(result.ok).toBe(false)
  })

  it('rejects when location_id does not match GHL_LOCATION_ID', () => {
    const result = authorizeLaunch({ secret: TEST_SECRET, locationId: 'loc_OTHER' })
    expect(result.ok).toBe(false)
  })

  it('rejects when location_id is null', () => {
    const result = authorizeLaunch({ secret: TEST_SECRET, locationId: null })
    expect(result.ok).toBe(false)
  })

  it('rejects (fail-closed) when GHL_EMBED_LAUNCH_SECRET is not configured', () => {
    vi.stubEnv('GHL_EMBED_LAUNCH_SECRET', '')
    const result = authorizeLaunch({ secret: TEST_SECRET, locationId: TEST_LOCATION })
    expect(result.ok).toBe(false)
  })

  it('rejects when both secret and location are wrong', () => {
    const result = authorizeLaunch({ secret: 'bad', locationId: 'loc_bad' })
    expect(result.ok).toBe(false)
  })
})
