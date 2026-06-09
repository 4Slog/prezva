import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

export interface EmbeddedSessionPayload extends JWTPayload {
  location_id: string
  user_email?: string
}

const COOKIE_NAME = 'embedded_session'
const EXPIRY = '1h'

function getSecret(): Uint8Array {
  const secret = process.env.EMBEDDED_SESSION_SECRET
  if (!secret) throw new Error('EMBEDDED_SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function mintEmbeddedSession(
  location_id: string,
  user_email?: string,
): Promise<string> {
  const payload: Record<string, unknown> = { location_id }
  if (user_email) payload.user_email = user_email

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecret())
}

export async function verifyEmbeddedSession(
  token: string,
): Promise<EmbeddedSessionPayload> {
  const { payload } = await jwtVerify<EmbeddedSessionPayload>(token, getSecret())
  return payload
}

// Pure — no I/O, fully unit-testable.
// Builds the CSP frame-ancestors directive string for /embedded responses.
// Always includes app.gohighlevel.com; appends any extra origins passed in.
export function buildEmbeddedCsp(extraOrigins: string[] = []): string {
  const base = ['https://app.gohighlevel.com']
  const all = [...base, ...extraOrigins.map((s) => s.trim()).filter(Boolean)]
  return `frame-ancestors ${all.join(' ')}`
}

export { COOKIE_NAME }
