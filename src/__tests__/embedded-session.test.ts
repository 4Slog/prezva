// @vitest-environment node
// jose uses Uint8Array instanceof checks that fail in jsdom's non-Node realm.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildEmbeddedCsp, mintEmbeddedSession, verifyEmbeddedSession } from '@/lib/embedded/session'

// Provide a test secret via env so getSecret() doesn't throw
beforeEach(() => {
  vi.stubEnv('EMBEDDED_SESSION_SECRET', 'test-secret-that-is-at-least-32-chars-long!')
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
    // Flip the last character to corrupt the signature
    const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a')
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
