import 'server-only'
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

// OAuth `state` for /api/integrations/[provider]/auth → callback (E-R5).
// The old state was unsigned base64 JSON, so anyone could send the callback a
// state naming someone else's org and bind their own provider account to it.
// Now: HMAC-SHA256 over {provider, orgId, userId, exp, nonce}; the callback
// checks the signature, the expiry, that the provider matches the route and
// that the signed-in user is the one who started the flow.
//
// Secret: INTEGRATION_STATE_SECRET if set, else a key derived (HKDF, own
// label) from INTEGRATION_ENCRYPTION_KEY — never that key itself. Neither set
// → signing and verifying both fail closed.

export const OAUTH_STATE_TTL_SECONDS = 600

export type OAuthStatePayload = { provider: string; orgId: string; userId: string; exp: number; nonce: string }

function stateKey(): Buffer | null {
  const explicit = process.env.INTEGRATION_STATE_SECRET
  if (explicit !== undefined && explicit !== '') {
    // Set but too short is a misconfiguration: fail closed rather than quietly
    // falling back to the derived key.
    if (explicit.length < 32) { console.error('[oauth-state] INTEGRATION_STATE_SECRET is shorter than 32 characters'); return null }
    return Buffer.from(explicit, 'utf8')
  }
  const base = process.env.INTEGRATION_ENCRYPTION_KEY
  if (!base) return null
  return Buffer.from(hkdfSync('sha256', Buffer.from(base, 'utf8'), Buffer.alloc(0), Buffer.from('prezva/integrations/oauth-state/v1'), 32))
}

const sign = (key: Buffer, body: string) => createHmac('sha256', key).update(body).digest('base64url')

export function signOAuthState(input: { provider: string; orgId: string; userId: string }, now = Date.now()): string {
  const key = stateKey()
  if (!key) throw new Error('OAuth state secret is not configured')
  const payload: OAuthStatePayload = {
    ...input,
    exp: Math.floor(now / 1000) + OAUTH_STATE_TTL_SECONDS,
    nonce: randomBytes(16).toString('base64url'),
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(key, body)}`
}

export type VerifyResult = { ok: true; orgId: string } | { ok: false; reason: 'unconfigured' | 'malformed' | 'signature' | 'expired' | 'provider' | 'user' }

export function verifyOAuthState(state: string | null, expect: { provider: string; userId: string }, now = Date.now()): VerifyResult {
  const key = stateKey()
  if (!key) return { ok: false, reason: 'unconfigured' }
  if (typeof state !== 'string') return { ok: false, reason: 'malformed' }
  const [body, mac, extra] = state.split('.')
  if (!body || !mac || extra !== undefined) return { ok: false, reason: 'malformed' }
  const want = Buffer.from(sign(key, body))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'signature' }
  let payload: OAuthStatePayload
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return { ok: false, reason: 'malformed' } }
  if (typeof payload?.orgId !== 'string' || typeof payload.exp !== 'number') return { ok: false, reason: 'malformed' }
  if (payload.exp < Math.floor(now / 1000)) return { ok: false, reason: 'expired' }
  if (payload.provider !== expect.provider) return { ok: false, reason: 'provider' }
  if (payload.userId !== expect.userId) return { ok: false, reason: 'user' }
  return { ok: true, orgId: payload.orgId }
}
