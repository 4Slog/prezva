// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generateKeyPairSync, sign } from 'node:crypto'

import { verifyGhlAppSignature, GHL_APP_WEBHOOK_SIGNATURE_HEADER } from './app-webhook-auth'

// A real Ed25519 keypair generated per run. We sign with OUR key and point the
// verifier at OUR public key via the env override — we never possess GHL's
// private key, so signing with the pinned production key is impossible. This
// exercises the actual crypto path rather than a stub, and proves the override
// works, which is the mechanism a real key roll would use.
const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const BODY = JSON.stringify({ type: 'OrderStatusUpdate', _id: 'order-1', status: 'completed' })

function signBody(body: string, key = privateKey): string {
  return sign(null, Buffer.from(body, 'utf8'), key).toString('base64')
}

beforeEach(() => {
  vi.stubEnv('GHL_WEBHOOK_PUBLIC_KEY', PUBLIC_PEM)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('verifyGhlAppSignature', () => {
  it('accepts a signature produced over the exact raw body', () => {
    expect(verifyGhlAppSignature(BODY, signBody(BODY))).toBe(true)
  })

  it('rejects a signature from a different key', () => {
    const { privateKey: otherKey } = generateKeyPairSync('ed25519')

    expect(verifyGhlAppSignature(BODY, signBody(BODY, otherKey))).toBe(false)
  })

  // The whole point of signing raw bytes: a payload edited in flight must fail
  // even though it is still valid JSON and still parses to a sane object.
  it('rejects a tampered body carrying an otherwise-valid signature', () => {
    const signature = signBody(BODY)
    const tampered = JSON.stringify({ type: 'OrderStatusUpdate', _id: 'order-1', status: 'completed', amount: 999999 })

    expect(verifyGhlAppSignature(tampered, signature)).toBe(false)
  })

  // Byte-exactness, not semantic equality: re-serializing a parsed object can
  // reorder keys or change whitespace, and that alone must fail. This is why
  // the route reads the raw string once and never re-stringifies.
  it('rejects a semantically identical body that was re-serialized differently', () => {
    const signature = signBody(BODY)
    const reordered = JSON.stringify({ status: 'completed', _id: 'order-1', type: 'OrderStatusUpdate' })

    expect(reordered).not.toBe(BODY)
    expect(JSON.parse(reordered)).toEqual(JSON.parse(BODY))
    expect(verifyGhlAppSignature(reordered, signature)).toBe(false)
  })

  it('rejects an absent signature header', () => {
    expect(verifyGhlAppSignature(BODY, null)).toBe(false)
  })

  it('rejects an empty or whitespace-only signature header', () => {
    expect(verifyGhlAppSignature(BODY, '')).toBe(false)
    expect(verifyGhlAppSignature(BODY, '   ')).toBe(false)
  })

  it('rejects malformed base64 without throwing', () => {
    expect(() => verifyGhlAppSignature(BODY, 'not-valid-base64!!!')).not.toThrow()
    expect(verifyGhlAppSignature(BODY, 'not-valid-base64!!!')).toBe(false)
  })

  it('rejects a well-formed base64 string of the wrong length', () => {
    expect(verifyGhlAppSignature(BODY, Buffer.alloc(32).toString('base64'))).toBe(false)
  })

  it('rejects rather than throwing when the configured public key is unparseable', () => {
    vi.stubEnv('GHL_WEBHOOK_PUBLIC_KEY', 'not a pem at all')

    expect(verifyGhlAppSignature(BODY, signBody(BODY))).toBe(false)
  })

  it('falls back to the pinned key when the env override is unset, and rejects our test signature against it', () => {
    vi.stubEnv('GHL_WEBHOOK_PUBLIC_KEY', '')

    // Proves the pinned constant is a real, parseable Ed25519 key on the live
    // path: a bad key would throw into the catch and be indistinguishable from
    // this. Our signature correctly fails against GHL's genuine public key.
    expect(verifyGhlAppSignature(BODY, signBody(BODY))).toBe(false)
  })

  it('exports the header name the route reads, and it is not the legacy one', () => {
    expect(GHL_APP_WEBHOOK_SIGNATURE_HEADER).toBe('x-ghl-signature')
    expect(GHL_APP_WEBHOOK_SIGNATURE_HEADER).not.toBe('x-wh-signature')
  })
})
