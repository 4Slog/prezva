import { createHash, timingSafeEqual } from 'node:crypto'

// NOTE: This file uses node:crypto and must only be imported from Node.js runtime
// routes (e.g. src/app/api/**). Do NOT import from middleware.ts or any Edge route —
// session.ts (which middleware imports) intentionally does not import this file.

export interface AuthorizeLaunchResult {
  ok: boolean
  reason?: string
}

// Pure — no I/O, fully unit-testable.
// Interim auth gate for /api/embedded/launch (GE-2a.1).
// Fail-closed: returns { ok: false } when GHL_EMBED_LAUNCH_SECRET is unset/empty
// or the provided secret is missing. SHA-256 digests both secrets before calling
// timingSafeEqual so the comparison is always over 32 bytes (avoids length leak).
// Also requires locationId === GHL_LOCATION_ID (single-location PIT gate).
// Full GHL-signed SSO verification is deferred to GE-8.
export function authorizeLaunch({
  secret,
  locationId,
}: {
  secret: string | null | undefined
  locationId: string | null | undefined
}): AuthorizeLaunchResult {
  const expected = process.env.GHL_EMBED_LAUNCH_SECRET
  if (!expected) return { ok: false, reason: 'secret_not_configured' }
  if (!secret) return { ok: false, reason: 'secret_missing' }

  const digestExpected = createHash('sha256').update(expected).digest()
  const digestProvided = createHash('sha256').update(secret).digest()
  if (!timingSafeEqual(digestExpected, digestProvided)) {
    return { ok: false, reason: 'secret_mismatch' }
  }

  const configuredLocation = process.env.GHL_LOCATION_ID
  if (!configuredLocation || locationId !== configuredLocation) {
    return { ok: false, reason: 'location_mismatch' }
  }

  return { ok: true }
}
