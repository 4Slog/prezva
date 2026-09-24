import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

// R88: the staff grant an offline session scanner carries. It records WHO was
// authorised to scan WHICH session when the device went offline, so a sync can
// attribute queued check-ins to that staff member instead of whoever is signed
// in when the queue drains.
//
// It is signed with a key DERIVED from EMBEDDED_SESSION_SECRET (HKDF-SHA256,
// info 'prezva-offline-grant-v1'), never with the secret itself, so a grant can
// never verify as an embed session and an embed session can never verify as a
// grant. The audience is checked as a second, independent guard.

export const OFFLINE_GRANT_AUDIENCE = 'prezva-offline-grant'
const HKDF_INFO = 'prezva-offline-grant-v1'

const DAY_MS = 24 * 60 * 60 * 1000
// The grant outlives the event by a day, so a queue can drain the next morning.
const GRANT_AFTER_EVENT_END_MS = DAY_MS
const GRANT_MAX_LIFETIME_MS = 7 * DAY_MS
// Clock tolerance for the scan-time floor: a scan up to this long before the
// grant was issued is recorded at the floor, not earlier.
export const GRANT_ISSUE_TOLERANCE_MS = 5 * 60 * 1000

export const GRANT_EXPIRED_REASON = 'Staff authorization expired; review'
export const GRANT_PERMISSION_LOST_REASON = 'Staff member no longer has check-in access; review'

export type OfflineGrantSurface = 'dashboard' | 'embed'

export interface OfflineGrantClaims {
  surface: OfflineGrantSurface
  eventId: string
  sessionId: string
  orgId: string
  // Dashboard: the signed-in staff member. Embedded: the org member the embed
  // email resolved to (exactly one), else null.
  userId: string | null
  // Embedded: the GHL staff email from the embed session. Dashboard: null.
  email: string | null
}

export interface VerifiedOfflineGrant extends OfflineGrantClaims {
  issuedAt: Date
  expiresAt: Date
}

let keyPromise: Promise<Uint8Array> | null = null
let keySecret: string | null = null

async function grantKey(): Promise<Uint8Array> {
  const secret = process.env.EMBEDDED_SESSION_SECRET
  if (!secret) throw new Error('EMBEDDED_SESSION_SECRET is not set')
  if (!keyPromise || keySecret !== secret) {
    keySecret = secret
    keyPromise = (async () => {
      const enc = new TextEncoder()
      const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveBits'])
      const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(HKDF_INFO) },
        base,
        256,
      )
      return new Uint8Array(bits)
    })()
  }
  return keyPromise
}

// exp = the event's end + 24h (now + 24h when the event has no end), capped at
// now + 7 days. An event that ended more than a day ago yields a grant that is
// already expired: offline scanning of a finished event is not authorised.
export function grantExpiry(eventEndsAt: string | null, now: Date = new Date()): Date {
  const nowMs = now.getTime()
  const end = eventEndsAt ? Date.parse(eventEndsAt) : NaN
  const exp = Number.isNaN(end) ? nowMs + DAY_MS : end + GRANT_AFTER_EVENT_END_MS
  return new Date(Math.min(exp, nowMs + GRANT_MAX_LIFETIME_MS))
}

export async function mintOfflineGrant(
  claims: OfflineGrantClaims,
  eventEndsAt: string | null,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000)
  const exp = Math.floor(grantExpiry(eventEndsAt, now).getTime() / 1000)
  return new SignJWT({
    surface: claims.surface,
    eventId: claims.eventId,
    sessionId: claims.sessionId,
    orgId: claims.orgId,
    userId: claims.userId,
    email: claims.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(OFFLINE_GRANT_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(await grantKey())
}

type GrantPayload = JWTPayload & Partial<Record<keyof OfflineGrantClaims, unknown>>

const nullableString = (v: unknown): v is string | null => v === null || typeof v === 'string'

// Verifies signature, audience and expiry, then that the grant is for exactly
// this surface, event and session. Any failure → null (the caller refuses every
// entry with GRANT_EXPIRED_REASON).
export async function verifyOfflineGrant(
  token: string,
  expected: { surface: OfflineGrantSurface; eventId: string; sessionId: string },
): Promise<VerifiedOfflineGrant | null> {
  let payload: GrantPayload
  try {
    ;({ payload } = await jwtVerify<GrantPayload>(token, await grantKey(), {
      audience: OFFLINE_GRANT_AUDIENCE,
      algorithms: ['HS256'],
      requiredClaims: ['iat', 'exp'],
    }))
  } catch {
    return null
  }
  const { surface, eventId, sessionId, orgId, userId, email, iat, exp } = payload
  if (surface !== expected.surface || eventId !== expected.eventId || sessionId !== expected.sessionId) return null
  if (typeof orgId !== 'string' || !nullableString(userId) || !nullableString(email)) return null
  if (typeof iat !== 'number' || typeof exp !== 'number') return null
  return {
    surface: expected.surface,
    eventId,
    sessionId,
    orgId,
    userId,
    email,
    issuedAt: new Date(iat * 1000),
    expiresAt: new Date(exp * 1000),
  }
}

// The earliest check-in time a grant allows (resolveScanTime's floor).
export function grantScanFloor(grant: VerifiedOfflineGrant): Date {
  return new Date(grant.issuedAt.getTime() - GRANT_ISSUE_TOLERANCE_MS)
}
